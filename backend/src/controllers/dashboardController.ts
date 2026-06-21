import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  startOfWeek,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  format,
  eachMonthOfInterval,
  eachDayOfInterval,
} from "date-fns";

const prisma = new PrismaClient();

export const dashboardController = {
  // Get dashboard statistics
  getDashboardStats: async (req: Request, res: Response) => {
    try {
      const { period = "today", branchId } = req.query;
      const organizationId = (req as any).organizationId as string | undefined;
      const rbacUser = (req as any).rbacUser as
        | {
            userType?: string;
            orgRole?: string | null;
            assignedBranchIds?: string[];
          }
        | undefined;

      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      const allowedBranchIds =
        !isOrgAdmin && Array.isArray(rbacUser?.assignedBranchIds) && rbacUser.assignedBranchIds.length > 0
          ? rbacUser.assignedBranchIds
          : null;

      if (!isOrgAdmin && !allowedBranchIds && rbacUser?.userType !== "SUPER_ADMIN" && !branchId) {
        res.status(403).json({
          success: false,
          message: "Access denied",
        });
        return;
      }

      // Calculate date ranges based on period using date-fns
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      switch (period) {
        case "today":
          startDate = startOfDay(now);
          endDate = endOfDay(now);
          break;
        case "this_week":
          startDate = startOfWeek(now, { weekStartsOn: 1 }); // Monday
          endDate = endOfDay(now); // End of today
          break;
        case "this_month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "last_7_days":
          startDate = subDays(startOfDay(now), 6); // Last 7 days including today
          break;
        case "last_30_days":
          startDate = subDays(startOfDay(now), 29); // Last 30 days including today
          break;
        case "last_3_months":
          startDate = startOfMonth(subMonths(now, 2)); // Current month + 2 previous months (3 months total)
          break;
        case "last_6_months":
          startDate = startOfMonth(subMonths(now, 5)); // Current month + 5 previous months (6 months total)
          break;
        case "last_year":
          startDate = subYears(now, 1);
          break;
        case "this_year":
          startDate = startOfYear(now); // January 1st of current year
          endDate = endOfMonth(now); // End of current month
          break;
        default:
          startDate = startOfDay(now);
      }

      // Get total users
      // Definition: distinct users with at least one purchase in the last year
      // from any branch of the current organization.
      const purchaserSince = subYears(now, 1);
      const purchasers = await prisma.order.findMany({
        where: {
          createdAt: {
            gte: purchaserSince,
            lte: now,
          },
          status: {
            not: "CANCELLED",
          },
          paymentStatus: "PAID",
          userId: {
            not: null,
          },
          ...(organizationId
            ? {
                branch: {
                  organizationId,
                },
              }
            : {}),
        },
        select: {
          userId: true,
        },
        distinct: ["userId"],
      });
      const totalUsers = purchasers.length;

      // Get total menu items
      const totalMenuItems = await prisma.meal.count({
        where: organizationId
          ? {
              organizationId,
            }
          : undefined,
      });

      // Build where clause for orders (exclude cancelled orders from revenue stats)
      const ordersWhere: any = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          not: "CANCELLED",
        },
        paymentStatus: "PAID",
        ...(organizationId
          ? {
              branch: {
                organizationId,
              },
            }
          : {}),
      };

      let selectedBranch = null;
      let selectedOrganization = null;

      // Fetch organization information if organizationId is available
      if (organizationId) {
        const organization = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { id: true, name: true, isActive: true },
        });
        
        if (organization) {
          // Fetch current validation status
          const currentValidation = await prisma.organizationValidation.findFirst({
            where: { 
              organizationId,
            },
            orderBy: { validatedAt: 'desc' },
            select: {
              id: true,
              validatedAt: true,
              expiresAt: true,
              gracePeriodEndsAt: true,
              isActive: true,
              unvalidatedAt: true,
              unvalidatedBy: true,
            },
          });

          selectedOrganization = {
            ...organization,
            validation: currentValidation,
          };
        }
      }

      if (allowedBranchIds) {
        ordersWhere.branchId = {
          in: allowedBranchIds,
        };
      }

      // Filter by branch if provided
      if (branchId) {
        if (allowedBranchIds && !allowedBranchIds.includes(branchId as string)) {
          res.status(403).json({
            success: false,
            message: "Access denied",
          });
          return;
        }

        ordersWhere.branchId = branchId as string;
        if (organizationId) {
          const branch = await prisma.branch.findFirst({
            where: { id: branchId as string, organizationId },
            select: { id: true, name: true, isActive: true },
          });
          if (!branch) {
            res.status(400).json({
              success: false,
              message: "Invalid branchId for this organization",
            });
            return;
          }
          selectedBranch = branch;
        }
      }

      // Get orders for the period
      const ordersInPeriod = await prisma.order.findMany({
        where: ordersWhere,
        include: {
          orderItems: {
            include: {
              meal: true,
            },
          },
        },
      });

      // Calculate statistics
      const totalOrders = ordersInPeriod.length;
      const totalRevenue = ordersInPeriod.reduce((sum, order) => {
        return sum + Number(order.totalAmount);
      }, 0);
      // Get previous period for comparison
      let previousStartDate: Date;
      let previousEndDate: Date;

      if (period === "this_week") {
        // For this_week, compare with the same days of the previous week
        // e.g., if today is Tuesday, compare Monday-Tuesday this week with Monday-Tuesday last week
        const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday of this week at 00:00
        const todayStart = startOfDay(now); // Today at 00:00

        // Calculate the number of days from Monday to today (inclusive)
        // Use differenceInDays from date-fns would be better, but we'll use milliseconds
        // We need to ensure we're comparing dates at the same time of day
        const daysSinceWeekStart = Math.floor(
          (todayStart.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Calculate the same Monday of the previous week
        const previousWeekStart = subWeeks(weekStart, 1);

        // Calculate the same day in the previous week by adding days to the previous week's Monday
        // Use startOfDay to ensure we're working with normalized dates
        const previousWeekSameDayStart = startOfDay(
          new Date(
            previousWeekStart.getTime() +
              daysSinceWeekStart * 24 * 60 * 60 * 1000
          )
        );

        previousStartDate = startOfDay(previousWeekStart); // Last Monday 00:00
        previousEndDate = endOfDay(previousWeekSameDayStart); // Last week's same day 23:59:59
      } else {
        // For other periods, use the original calculation
        const periodLength = endDate.getTime() - startDate.getTime();
        previousStartDate = new Date(startDate.getTime() - periodLength);
        previousEndDate = new Date(startDate.getTime() - 1);
      }

      // Build where clause for previous period orders (exclude cancelled orders)
      const previousOrdersWhere: any = {
        createdAt: {
          gte: previousStartDate,
          lte: previousEndDate,
        },
        status: {
          not: "CANCELLED",
        },
        ...(organizationId
          ? {
              branch: {
                organizationId,
              },
            }
          : {}),
      };

      if (allowedBranchIds) {
        previousOrdersWhere.branchId = {
          in: allowedBranchIds,
        };
      }

      // Filter by branch if provided
      if (branchId) {
        if (allowedBranchIds && !allowedBranchIds.includes(branchId as string)) {
          res.status(403).json({
            success: false,
            message: "Access denied",
          });
          return;
        }
        previousOrdersWhere.branchId = branchId as string;
      }

      const previousOrders = await prisma.order.findMany({
        where: previousOrdersWhere,
      });

      const previousTotalOrders = previousOrders.length;
      const previousRevenue = previousOrders.reduce((sum, order) => {
        return sum + Number(order.totalAmount);
      }, 0);

      // Calculate percentage changes
      const ordersChange =
        previousTotalOrders > 0
          ? ((totalOrders - previousTotalOrders) / previousTotalOrders) * 100
          : totalOrders > 0
          ? 100
          : 0;

      const revenueChange =
        previousRevenue > 0
          ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
          : totalRevenue > 0
          ? 100
          : 0;

      res.json({
        success: true,
        data: {
          totalUsers,
          totalMenuItems,
          totalOrders,
          totalRevenue,
          ordersChange: Math.round(ordersChange * 100) / 100,
          revenueChange: Math.round(revenueChange * 100) / 100,
          period,
          selectedBranch,
          selectedOrganization,
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard statistics",
      });
    }
  },

  // Get chart data for analytics
  getChartData: async (req: Request, res: Response) => {
    try {
      const { period = "this_month", chartType = "orders", branchId } = req.query;
      const organizationId = (req as any).organizationId as string | undefined;
      const rbacUser = (req as any).rbacUser as
        | {
            userType?: string;
            orgRole?: string | null;
            assignedBranchIds?: string[];
          }
        | undefined;

      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      const allowedBranchIds =
        !isOrgAdmin && Array.isArray(rbacUser?.assignedBranchIds) && rbacUser.assignedBranchIds.length > 0
          ? rbacUser.assignedBranchIds
          : null;

      if (!isOrgAdmin && !allowedBranchIds && rbacUser?.userType !== "SUPER_ADMIN" && !branchId) {
        res.status(403).json({
          success: false,
          message: "Access denied",
        });
        return;
      }

      // Calculate date ranges using date-fns
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      switch (period) {
        case "today":
          startDate = startOfDay(now);
          endDate = endOfDay(now);
          break;
        case "this_week":
          startDate = startOfWeek(now, { weekStartsOn: 1 }); // Monday
          endDate = endOfDay(now); // End of today
          break;
        case "this_month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "last_7_days":
          startDate = subDays(startOfDay(now), 6); // Last 7 days including today
          break;
        case "last_30_days":
          startDate = subDays(startOfDay(now), 29); // Last 30 days including today
          break;
        case "last_3_months":
          startDate = startOfMonth(subMonths(now, 2)); // Current month + 2 previous months (3 months total)
          break;
        case "last_6_months":
          startDate = startOfMonth(subMonths(now, 5)); // Current month + 5 previous months (6 months total)
          break;
        case "last_year":
          startDate = subYears(now, 1);
          break;
        case "this_year":
          startDate = startOfYear(now); // January 1st of current year
          endDate = endOfMonth(now); // End of current month
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      if (chartType === "orders") {
        // Build where clause for orders chart
        // Exclude cancelled and rejected orders, only include PAID orders
        const ordersChartWhere: any = {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          status: {
            not: "CANCELLED",
          },
          paymentStatus: "PAID",
          ...(organizationId
            ? {
                branch: {
                  organizationId,
                },
              }
            : {}),
        };

        if (allowedBranchIds) {
          ordersChartWhere.branchId = {
            in: allowedBranchIds,
          };
        }

        // Filter by branch if provided
        if (branchId) {
          if (allowedBranchIds && !allowedBranchIds.includes(branchId as string)) {
            res.status(403).json({
              success: false,
              message: "Access denied",
            });
            return;
          }
          ordersChartWhere.branchId = branchId as string;
          if (organizationId) {
            const branch = await prisma.branch.findFirst({
              where: { id: branchId as string, organizationId },
              select: { id: true },
            });
            if (!branch) {
              res.status(400).json({
                success: false,
                message: "Invalid branchId for this organization",
              });
              return;
            }
          }
        }

        // Orders over time chart
        const orders = await prisma.order.findMany({
          where: ordersChartWhere,
          select: {
            createdAt: true,
            totalAmount: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        // Group by day/week/month based on period
        const groupedData: {
          [key: string]: { count: number; revenue: number };
        } = {};

        // For today, generate all hours from 0 to current hour
        if (period === "today") {
          const currentHour = now.getHours();
          for (let hour = 0; hour <= currentHour; hour++) {
            const hourKey = `${hour}`;
            groupedData[hourKey] = { count: 0, revenue: 0 };
          }
        }

        // For this_week, generate all days from Monday to today
        if (period === "this_week") {
          const weekStart = startOfDay(startOfWeek(now, { weekStartsOn: 1 })); // Monday at 00:00
          const today = startOfDay(now);
          let currentDay = new Date(weekStart);

          while (currentDay <= today) {
            const dayKey = format(currentDay, "EEE");
            groupedData[dayKey] = { count: 0, revenue: 0 };
            currentDay = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000);
          }
        }

        // For this_month, generate all days from start of month to today
        if (period === "this_month") {
          const monthStart = startOfDay(startOfMonth(now));
          const today = startOfDay(now);
          const daysInMonth = eachDayOfInterval({
            start: monthStart,
            end: today,
          });

          daysInMonth.forEach((dayDate) => {
            const dayKey = `${dayDate.getDate()}`; // Just the day number (1, 2, 3, etc.)
            groupedData[dayKey] = { count: 0, revenue: 0 };
          });
        }

        // For last_30_days, generate all days with smart formatting
        if (period === "last_30_days") {
          const thirtyDaysAgo = startOfDay(subDays(now, 29));
          const today = startOfDay(now);
          const daysInRange = eachDayOfInterval({
            start: thirtyDaysAgo,
            end: today,
          });

          let previousMonth = -1;
          daysInRange.forEach((dayDate, index) => {
            const currentMonth = dayDate.getMonth();
            const isFirstDay = index === 0;
            const isNewMonth = currentMonth !== previousMonth;

            let dayKey: string;
            if (isFirstDay || isNewMonth) {
              // Show "day month" for first day or first day of new month
              dayKey = format(dayDate, "d MMM"); // e.g., "28 Oct", "1 Nov"
            } else {
              // Just show day number
              dayKey = `${dayDate.getDate()}`; // e.g., "29", "30", "31"
            }

            groupedData[dayKey] = { count: 0, revenue: 0 };
            previousMonth = currentMonth;
          });
        }

        // For last_3_months and last_6_months, generate all months in the range
        if (period === "last_3_months" || period === "last_6_months") {
          const monthsInRange = eachMonthOfInterval({
            start: startOfMonth(startDate),
            end: endOfMonth(endDate),
          });

          monthsInRange.forEach((monthDate) => {
            const monthKey = format(monthDate, "MMM");
            groupedData[monthKey] = { count: 0, revenue: 0 };
          });
        }

        // For this_year, generate all months from January to current month
        if (period === "this_year") {
          const yearStart = startOfYear(now);
          const currentMonthEnd = endOfMonth(now);
          const monthsInRange = eachMonthOfInterval({
            start: startOfMonth(yearStart),
            end: currentMonthEnd,
          });

          monthsInRange.forEach((monthDate) => {
            const monthKey = format(monthDate, "MMM");
            groupedData[monthKey] = { count: 0, revenue: 0 };
          });
        }

        // For last_year, generate all months from 1 year ago to now
        if (period === "last_year") {
          const oneYearAgo = subYears(now, 1);
          const monthsInRange = eachMonthOfInterval({
            start: startOfMonth(oneYearAgo),
            end: endOfMonth(now),
          });

          monthsInRange.forEach((monthDate) => {
            const monthKey = format(monthDate, "MMM");
            groupedData[monthKey] = { count: 0, revenue: 0 };
          });
        }

        orders.forEach((order) => {
          let key: string;
          const date = new Date(order.createdAt);

          if (period === "today") {
            key = `${date.getHours()}`;
          } else if (period === "this_week") {
            key = format(date, "EEE"); // Mon, Tue, Wed, etc.
          } else if (period === "last_7_days") {
            key = format(date, "MMM dd"); // Jan 15, Jan 16, etc.
          } else if (period === "this_month") {
            key = `${date.getDate()}`; // Just the day number (1, 2, 3, etc.)
          } else if (period === "last_30_days") {
            // For last_30_days, use smart formatting: "day month" for first day and new months, just day number otherwise
            // We need to check if this date is the first day of the range or the first day of a new month
            const thirtyDaysAgo = startOfDay(subDays(now, 29));
            const orderDate = startOfDay(date);
            const isFirstDay = orderDate.getTime() === thirtyDaysAgo.getTime();

            // Check if this is the first day of a new month by comparing with previous day
            const previousDay = new Date(orderDate);
            previousDay.setDate(previousDay.getDate() - 1);
            const isNewMonth = date.getMonth() !== previousDay.getMonth();

            if (isFirstDay || isNewMonth) {
              key = format(date, "d MMM"); // e.g., "28 Oct", "1 Nov"
            } else {
              key = `${date.getDate()}`; // e.g., "29", "30", "31"
            }
          } else if (
            period === "last_3_months" ||
            period === "last_6_months" ||
            period === "this_year" ||
            period === "last_year"
          ) {
            key = format(date, "MMM"); // Jan, Feb, etc.
          } else {
            key = format(date, "MMM yyyy"); // Default to month-year
          }

          if (!groupedData[key]) {
            groupedData[key] = { count: 0, revenue: 0 };
          }
          groupedData[key].count += 1;
          groupedData[key].revenue += Number(order.totalAmount);
        });

        // Sort labels properly
        let labels: string[];
        if (period === "today") {
          // Show only even hours from 0 to current hour in chronological order
          const currentHour = now.getHours();
          labels = [];
          for (let hour = 0; hour <= currentHour; hour++) {
            if (hour % 2 === 0) {
              labels.push(`${hour}`);
            }
          }
        } else if (period === "this_week") {
          // Show all days from Monday to today, even if they have no data
          const weekStart = startOfDay(startOfWeek(now, { weekStartsOn: 1 })); // Monday at 00:00
          const today = startOfDay(now);
          const daysInWeek = [];
          let currentDay = new Date(weekStart);

          while (currentDay <= today) {
            const dayKey = format(currentDay, "EEE");
            daysInWeek.push(dayKey);
            currentDay = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000);
          }

          labels = daysInWeek;
        } else if (period === "this_month") {
          // For this_month, show all days from start of month to today with just day numbers
          const monthStart = startOfDay(startOfMonth(now));
          const today = startOfDay(now);
          const daysInMonth = eachDayOfInterval({
            start: monthStart,
            end: today,
          });
          labels = daysInMonth.map((dayDate) => `${dayDate.getDate()}`);
        } else if (period === "last_30_days") {
          // For last_30_days, show dates with smart formatting: "day month" for first day and new months, just day number otherwise
          const thirtyDaysAgo = startOfDay(subDays(now, 29));
          const today = startOfDay(now);
          const daysInRange = eachDayOfInterval({
            start: thirtyDaysAgo,
            end: today,
          });

          let previousMonth = -1;
          labels = daysInRange.map((dayDate, index) => {
            const currentMonth = dayDate.getMonth();
            const isFirstDay = index === 0;
            const isNewMonth = currentMonth !== previousMonth;

            previousMonth = currentMonth;

            if (isFirstDay || isNewMonth) {
              // Show "day month" for first day or first day of new month
              return format(dayDate, "d MMM"); // e.g., "28 Oct", "1 Nov"
            } else {
              // Just show day number
              return `${dayDate.getDate()}`; // e.g., "29", "30", "31"
            }
          });
        } else if (period === "last_3_months" || period === "last_6_months") {
          // For monthly periods, sort by date to ensure chronological order
          const monthsInRange = eachMonthOfInterval({
            start: startOfMonth(startDate),
            end: endOfMonth(endDate),
          });
          labels = monthsInRange.map((monthDate) => format(monthDate, "MMM"));
        } else if (period === "this_year") {
          // For this_year, show all months from January to current month
          const yearStart = startOfYear(now);
          const currentMonthEnd = endOfMonth(now);
          const monthsInRange = eachMonthOfInterval({
            start: startOfMonth(yearStart),
            end: currentMonthEnd,
          });
          labels = monthsInRange.map((monthDate) => format(monthDate, "MMM"));
        } else if (period === "last_year") {
          // For last_year, show all months from 1 year ago to now
          const oneYearAgo = subYears(now, 1);
          const monthsInRange = eachMonthOfInterval({
            start: startOfMonth(oneYearAgo),
            end: endOfMonth(now),
          });
          labels = monthsInRange.map((monthDate) => format(monthDate, "MMM"));
        } else {
          labels = Object.keys(groupedData).sort();
        }

        const orderCounts = labels.map((label) => groupedData[label].count);
        const revenues = labels.map((label) => groupedData[label].revenue);

        res.json({
          success: true,
          data: {
            labels,
            datasets: [
              {
                label: "Orders",
                data: orderCounts,
                borderColor: "rgb(236, 72, 153)",
                backgroundColor: "rgba(236, 72, 153, 0.1)",
                tension: 0.4,
              },
              {
                label: "Revenue ($)",
                data: revenues,
                borderColor: "rgb(34, 197, 94)",
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                tension: 0.4,
                yAxisID: "y1",
              },
            ],
          },
        });
      } else if (chartType === "categories") {
        // Build where clause for categories chart
        const categoriesWhere: any = {
          order: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            ...(organizationId
              ? {
                  branch: {
                    organizationId,
                  },
                }
              : {}),
          },
        };

        // Filter by branch if provided
        if (branchId) {
          if (allowedBranchIds && !allowedBranchIds.includes(branchId as string)) {
            res.status(403).json({
              success: false,
              message: "Access denied",
            });
            return;
          }
          categoriesWhere.order.branchId = branchId as string;
        } else if (allowedBranchIds) {
          categoriesWhere.order.branchId = {
            in: allowedBranchIds,
          };
        }

        // Popular categories chart - get categories directly from meals
        const categoryData = await prisma.orderItem.findMany({
          where: categoriesWhere,
          include: {
            meal: {
              select: {
                category: true,
              },
            },
          },
        });

        const categoryStats: {
          [key: string]: { count: number; quantity: number };
        } = {};

        categoryData.forEach((item) => {
          if (item.meal && item.meal.category) {
            // Handle category as enum or object
            let category: string;
            if (typeof item.meal.category === "object") {
              category =
                item.meal.category.name || item.meal.category.toString();
            } else {
              category = String(item.meal.category);
            }

            if (!categoryStats[category]) {
              categoryStats[category] = { count: 0, quantity: 0 };
            }
            categoryStats[category].count += 1;
            categoryStats[category].quantity += item.quantity || 0;
          }
        });

        const labels = Object.keys(categoryStats);
        const data = labels.map((label) => categoryStats[label].quantity);

        // If no data, return empty chart with sample data
        if (labels.length === 0) {
          res.json({
            success: true,
            data: {
              labels: ["No Data"],
              datasets: [
                {
                  label: "Items Sold",
                  data: [1],
                  backgroundColor: ["rgba(156, 163, 175, 0.5)"],
                  borderColor: ["rgb(156, 163, 175)"],
                  borderWidth: 2,
                  hoverOffset: 4,
                },
              ],
            },
          });
          return;
        }

        res.json({
          success: true,
          data: {
            labels,
            datasets: [
              {
                label: "Items Sold",
                data,
                backgroundColor: [
                  "rgba(236, 72, 153, 0.8)", // Pink
                  "rgba(34, 197, 94, 0.8)", // Green
                  "rgba(59, 130, 246, 0.8)", // Blue
                  "rgba(245, 158, 11, 0.8)", // Yellow
                  "rgba(139, 69, 19, 0.8)", // Brown
                  "rgba(168, 85, 247, 0.8)", // Purple
                  "rgba(239, 68, 68, 0.8)", // Red
                  "rgba(16, 185, 129, 0.8)", // Emerald
                ],
                borderColor: [
                  "rgb(236, 72, 153)",
                  "rgb(34, 197, 94)",
                  "rgb(59, 130, 246)",
                  "rgb(245, 158, 11)",
                  "rgb(139, 69, 19)",
                  "rgb(168, 85, 247)",
                  "rgb(239, 68, 68)",
                  "rgb(16, 185, 129)",
                ],
                borderWidth: 2,
                hoverOffset: 4,
              },
            ],
          },
        });
      } else if (chartType === "branchRevenue") {
        // Branch revenue chart - only when branchId is not provided (all branches)
        if (branchId) {
          res.status(400).json({
            success: false,
            message: "Branch revenue chart is only available when viewing all branches",
          });
          return;
        }

        // Get orders with branch information
        // Exclude cancelled and rejected orders, only include PAID orders
        const orders = await prisma.order.findMany({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            branchId: {
              not: null,
            },
            status: {
              not: "CANCELLED",
            },
            paymentStatus: "PAID",
            ...(organizationId
              ? {
                  branch: {
                    organizationId,
                  },
                }
              : {}),
            ...(allowedBranchIds
              ? {
                  branchId: {
                    in: allowedBranchIds,
                  },
                }
              : {}),
          },
          include: {
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        // Group by branch
        const branchStats: {
          [key: string]: { name: string; revenue: number };
        } = {};

        orders.forEach((order) => {
          if (order.branch) {
            const branchId = order.branch.id;
            if (!branchStats[branchId]) {
              branchStats[branchId] = {
                name: order.branch.name,
                revenue: 0,
              };
            }
            branchStats[branchId].revenue += Number(order.totalAmount);
          }
        });

        const branchIds = Object.keys(branchStats);
        const labels = branchIds.map((id) => branchStats[id].name);
        const data = branchIds.map((id) => branchStats[id].revenue);

        if (labels.length === 0) {
          res.json({
            success: true,
            data: {
              labels: ["No Data"],
              datasets: [
                {
                  label: "Revenue",
                  data: [1],
                  backgroundColor: ["rgba(156, 163, 175, 0.5)"],
                  borderColor: ["rgb(156, 163, 175)"],
                  borderWidth: 2,
                  hoverOffset: 4,
                },
              ],
            },
          });
          return;
        }

        res.json({
          success: true,
          data: {
            branchIds,
            labels,
            datasets: [
              {
                label: "Revenue",
                data,
                backgroundColor: [
                  "rgba(236, 72, 153, 0.8)", // Pink
                  "rgba(34, 197, 94, 0.8)", // Green
                  "rgba(59, 130, 246, 0.8)", // Blue
                  "rgba(245, 158, 11, 0.8)", // Yellow
                  "rgba(139, 69, 19, 0.8)", // Brown
                  "rgba(168, 85, 247, 0.8)", // Purple
                  "rgba(239, 68, 68, 0.8)", // Red
                  "rgba(16, 185, 129, 0.8)", // Emerald
                ],
                borderColor: [
                  "rgb(236, 72, 153)",
                  "rgb(34, 197, 94)",
                  "rgb(59, 130, 246)",
                  "rgb(245, 158, 11)",
                  "rgb(139, 69, 19)",
                  "rgb(168, 85, 247)",
                  "rgb(239, 68, 68)",
                  "rgb(16, 185, 129)",
                ],
                borderWidth: 2,
                hoverOffset: 4,
              },
            ],
          },
        });
      } else if (chartType === "branchOrders") {
        // Branch orders chart - only when branchId is not provided (all branches)
        if (branchId) {
          res.status(400).json({
            success: false,
            message: "Branch orders chart is only available when viewing all branches",
          });
          return;
        }

        // Get orders with branch information
        // Exclude cancelled and rejected orders, only include PAID orders
        const orders = await prisma.order.findMany({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            branchId: {
              not: null,
            },
            status: {
              not: "CANCELLED",
            },
            paymentStatus: "PAID",
            ...(organizationId
              ? {
                  branch: {
                    organizationId,
                  },
                }
              : {}),
          },
          include: {
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        // Group by branch
        const branchStats: {
          [key: string]: { name: string; count: number };
        } = {};

        orders.forEach((order) => {
          if (order.branch) {
            const branchId = order.branch.id;
            if (!branchStats[branchId]) {
              branchStats[branchId] = {
                name: order.branch.name,
                count: 0,
              };
            }
            branchStats[branchId].count += 1;
          }
        });

        const branchIds = Object.keys(branchStats);
        const labels = branchIds.map((id) => branchStats[id].name);
        const data = branchIds.map((id) => branchStats[id].count);

        if (labels.length === 0) {
          res.json({
            success: true,
            data: {
              labels: ["No Data"],
              datasets: [
                {
                  label: "Orders",
                  data: [1],
                  backgroundColor: ["rgba(156, 163, 175, 0.5)"],
                  borderColor: ["rgb(156, 163, 175)"],
                  borderWidth: 2,
                  hoverOffset: 4,
                },
              ],
            },
          });
          return;
        }

        res.json({
          success: true,
          data: {
            branchIds,
            labels,
            datasets: [
              {
                label: "Orders",
                data,
                backgroundColor: [
                  "rgba(236, 72, 153, 0.8)", // Pink
                  "rgba(34, 197, 94, 0.8)", // Green
                  "rgba(59, 130, 246, 0.8)", // Blue
                  "rgba(245, 158, 11, 0.8)", // Yellow
                  "rgba(139, 69, 19, 0.8)", // Brown
                  "rgba(168, 85, 247, 0.8)", // Purple
                  "rgba(239, 68, 68, 0.8)", // Red
                  "rgba(16, 185, 129, 0.8)", // Emerald
                ],
                borderColor: [
                  "rgb(236, 72, 153)",
                  "rgb(34, 197, 94)",
                  "rgb(59, 130, 246)",
                  "rgb(245, 158, 11)",
                  "rgb(139, 69, 19)",
                  "rgb(168, 85, 247)",
                  "rgb(239, 68, 68)",
                  "rgb(16, 185, 129)",
                ],
                borderWidth: 2,
                hoverOffset: 4,
              },
            ],
          },
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Invalid chart type",
        });
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch chart data",
      });
    }
  },
};
