import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { type OrganizationContextRequest } from "../middleware/organizationContext";
import {
  startOfDay,
  subDays,
  format,
  eachDayOfInterval,
} from "date-fns";

const prisma = new PrismaClient();

export const categoryInsightsController = {
  // Get all available categories
  getCategories: async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      const categories = await prisma.category.findMany({
        select: {
          name: true,
        },
        where: {
          isActive: true,
          organizationId,
        },
      });

      const categoryNames = categories.map((category) => category.name);

      return res.json({
        success: true,
        data: categoryNames,
      });
    } catch (error) {
      console.error("Error fetching categories:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch categories",
      });
    }
  },

  // Get insights for a specific category
  getCategoryInsights: async (req: Request, res: Response) => {
    try {
      const { category, period = "last_30_days", branchId } = req.query;

      const rbacUser = (req as any).rbacUser as
        | {
            userType?: string;
            orgRole?: string | null;
            assignedBranchIds?: string[];
          }
        | undefined;
      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      const allowedBranchIds =
        !isOrgAdmin && rbacUser?.userType !== "SUPER_ADMIN" && Array.isArray(rbacUser?.assignedBranchIds)
          ? rbacUser.assignedBranchIds
          : null;

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      if (!category) {
        return res.status(400).json({
          success: false,
          message: "Category parameter is required",
        });
      }

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      switch (period) {
        case "today":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "this_week":
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          startDate = startOfWeek;
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "this_month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_7_days":
          startDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_30_days":
          // Last 30 days including today (29 days ago to today)
          startDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_3_months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_6_months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_year":
          startDate = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      }

      // Build order where clause
      const orderWhere: any = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      // Add branch filter if provided
      if (branchId) {
        const branchIdStr = branchId as string;

        if (allowedBranchIds && !allowedBranchIds.includes(branchIdStr)) {
          return res.status(403).json({
            success: false,
            message: "Access denied",
          });
        }

        const branch = await prisma.branch.findUnique({
          where: { id: branchIdStr },
          select: { id: true, organizationId: true },
        });

        if (!branch || branch.organizationId !== organizationId) {
          return res.status(404).json({
            success: false,
            message: "Branch not found",
          });
        }

        orderWhere.branchId = branchIdStr;
      } else {
        orderWhere.branch = { organizationId };

        if (allowedBranchIds) {
          if (allowedBranchIds.length === 0) {
            return res.status(403).json({
              success: false,
              message: "Access denied",
            });
          }
          orderWhere.branchId =
            allowedBranchIds.length === 1 ? allowedBranchIds[0] : { in: allowedBranchIds };
        }
      }

      // Get order items for the specific category
      const orderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            ...orderWhere,
          },
          OR: [
            {
              meal: {
                category: {
                  name: category as string,
                },
              },
            },
            {
              parentDealItemId: null,
              deal: {
                category: {
                  name: category as string,
                },
              },
            },
          ],
        },
        include: {
          meal: {
            select: {
              id: true,
              name: true,
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
          deal: {
            select: {
              id: true,
              name: true,
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
          orderItemAddOns: true,
          order: {
            select: {
              id: true,
              createdAt: true,
              totalAmount: true,
            },
          },
        },
      });

      // Calculate sales data
      const totalRevenue = orderItems.reduce(
        (sum, item) => sum + Number(item.totalPrice),
        0
      );
      const totalOrders = new Set(orderItems.map((item) => item.order.id)).size;
      const totalQuantity = orderItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      // Group by menu items
      const menuItemStats: {
        [key: string]: {
          name: string;
          sales: number;
          orders: number;
          quantity: number;
          avgPrice: number;
        };
      } = {};

      orderItems.forEach((item) => {
        const entityKey = item.meal?.id
          ? `meal:${item.meal.id}`
          : item.deal?.id
            ? `deal:${item.deal.id}`
            : null;
        const entityName = item.meal?.name || item.deal?.name;
        if (!entityKey || !entityName) return;

        if (!menuItemStats[entityKey]) {
          menuItemStats[entityKey] = {
            name: entityName,
            sales: 0,
            orders: 0,
            quantity: 0,
            avgPrice: 0,
          };
        }

        menuItemStats[entityKey].sales += Number(item.totalPrice);
        menuItemStats[entityKey].quantity += item.quantity;
        menuItemStats[entityKey].orders += 1;
        menuItemStats[entityKey].avgPrice = Number(item.unitPrice);
      });

      // Get popular add-ons
      const addOnStats: {
        [key: string]: {
          name: string;
          count: number;
          revenue: number;
        };
      } = {};

      orderItems.forEach((item) => {
        item.orderItemAddOns.forEach((addOnItem) => {
          const addOnName = addOnItem.addOnName;
          if (!addOnStats[addOnName]) {
            addOnStats[addOnName] = {
              name: addOnItem.addOnName,
              count: 0,
              revenue: 0,
            };
          }
          addOnStats[addOnName].count += 1;
          addOnStats[addOnName].revenue += Number(addOnItem.addOnPrice);
        });
      });

      // Get sales over time data
      const salesOverTime: {
        [key: string]: {
          revenue: number;
          orders: Set<string>;
          quantity: number;
          date: Date; // Store date for proper sorting
        };
      } = {};

      // For last_30_days, create a mapping of dates to labels and initialize all days
      // Use the same approach as dashboardController for consistency
      const dateToLabelMap: { [dateKey: string]: string } = {};
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

          // Create a date key for matching (YYYY-MM-DD)
          const dateKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
          
          let label: string;
          if (isFirstDay || isNewMonth) {
            // Show "day month" for first day or first day of new month
            label = format(dayDate, "d MMM"); // e.g., "13 Oct", "1 Nov"
          } else {
            // Just show day number
            label = `${dayDate.getDate()}`; // e.g., "14", "15", "30"
          }
          
          dateToLabelMap[dateKey] = label;
          
          // Use dateKey as the unique key to avoid collisions (e.g., "2" in Oct vs Nov)
          // We'll map to the label when outputting
          if (!salesOverTime[dateKey]) {
            salesOverTime[dateKey] = {
              revenue: 0,
              orders: new Set(),
              quantity: 0,
              date: new Date(dayDate),
            };
          }
          
          previousMonth = currentMonth;
        });
      }

      orderItems.forEach((item) => {
        const date = new Date(item.order.createdAt);
        let key: string;

        if (period === "today") {
          key = `${date.getHours()}:00`;
        } else if (period === "this_week" || period === "last_7_days") {
          key = date.toLocaleDateString("en-US", { weekday: "short" });
        } else if (period === "this_month") {
          key = `${date.getDate()}`;
        } else if (period === "last_30_days") {
          // Use dateKey as the key (YYYY-MM-DD format) to avoid collisions
          // The label will be mapped when outputting
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        } else if (period === "last_3_months" || period === "last_6_months") {
          key = date.toLocaleDateString("en-US", { month: "short" });
        } else if (period === "last_year") {
          key = date.toLocaleDateString("en-US", { month: "short" });
        } else {
          key = date.toLocaleDateString("en-US", { month: "short" });
        }

        if (!salesOverTime[key]) {
          salesOverTime[key] = {
            revenue: 0,
            orders: new Set(),
            quantity: 0,
            date: new Date(date),
          };
        }
        salesOverTime[key].revenue += Number(item.totalPrice);
        salesOverTime[key].quantity += item.quantity;
        salesOverTime[key].orders.add(item.order.id);
      });

      // Convert to arrays for charts
      const menuItemsArray = Object.values(menuItemStats).sort(
        (a, b) => b.sales - a.sales
      );
      const popularAddOnsArray = Object.values(addOnStats)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 add-ons

      // For last_30_days, ensure we output all days in order with correct labels
      let salesOverTimeArray;
      if (period === "last_30_days") {
        // Use the initialized days in order, ensuring all 30 days are included
        const thirtyDaysAgo = startOfDay(subDays(now, 29));
        const today = startOfDay(now);
        const daysInRange = eachDayOfInterval({
          start: thirtyDaysAgo,
          end: today,
        });

        salesOverTimeArray = daysInRange.map((dayDate) => {
          const dateKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
          const label = dateToLabelMap[dateKey] || format(dayDate, "d MMM");
          const data = salesOverTime[dateKey] || {
            revenue: 0,
            orders: new Set(),
            quantity: 0,
            date: new Date(dayDate),
          };
          
          return {
            label,
            revenue: data.revenue,
            orders: data.orders.size, // Convert Set to count
            quantity: data.quantity,
          };
        });
      } else {
        // For other periods, use the existing logic
        salesOverTimeArray = Object.entries(salesOverTime)
          .sort(([aKey, aData], [bKey, bData]) => {
            if (period === "today") {
              return aKey.localeCompare(bKey);
            } else if (
              period === "this_week" ||
              period === "last_7_days" ||
              period === "this_month"
            ) {
              // For numeric day keys, sort numerically
              const aNum = parseInt(aKey);
              const bNum = parseInt(bKey);
              if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
              }
              return aKey.localeCompare(bKey);
            } else {
              // For month keys, sort by date
              if (aData.date && bData.date) {
                return aData.date.getTime() - bData.date.getTime();
              }
              return aKey.localeCompare(bKey);
            }
          })
          .map(([dateKey, data]) => ({
            label: dateKey,
            revenue: data.revenue,
            orders: data.orders.size, // Convert Set to count
            quantity: data.quantity,
          }));
      }

      return res.json({
        success: true,
        data: {
          category: category as string,
          period: period as string,
          salesData: {
            totalRevenue,
            totalOrders,
            totalQuantity,
            avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          },
          menuItems: menuItemsArray,
          popularAddOns: popularAddOnsArray,
          salesOverTime: salesOverTimeArray,
        },
      });
    } catch (error) {
      console.error("Error fetching category insights:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch category insights",
      });
    }
  },

  // Get branch revenue chart for a category
  getBranchRevenueChart: async (req: Request, res: Response) => {
    try {
      const { category, period = "last_30_days" } = req.query;

      const rbacUser = (req as any).rbacUser as
        | {
            userType?: string;
            orgRole?: string | null;
            assignedBranchIds?: string[];
          }
        | undefined;
      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      const allowedBranchIds =
        !isOrgAdmin && rbacUser?.userType !== "SUPER_ADMIN" && Array.isArray(rbacUser?.assignedBranchIds)
          ? rbacUser.assignedBranchIds
          : null;

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "organizationId is required",
        });
      }

      if (!category) {
        return res.status(400).json({
          success: false,
          message: "Category parameter is required",
        });
      }

      // Calculate date range based on period (same logic as getCategoryInsights)
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      switch (period) {
        case "today":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "this_week":
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          startDate = startOfWeek;
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "this_month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_7_days":
          startDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_30_days":
          startDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_3_months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_6_months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        case "last_year":
          startDate = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      }

      // Get order items for the specific category with branch information
      const orderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            branchId: {
              not: null,
            },
            branch: {
              organizationId,
            },
            ...(allowedBranchIds
              ? {
                  branchId:
                    allowedBranchIds.length === 1
                      ? allowedBranchIds[0]
                      : { in: allowedBranchIds },
                }
              : {}),
          },
          OR: [
            {
              meal: {
                category: {
                  name: category as string,
                },
              },
            },
            {
              parentDealItemId: null,
              deal: {
                category: {
                  name: category as string,
                },
              },
            },
          ],
        },
        include: {
          order: {
            select: {
              branch: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      // Group by branch
      const branchStats: {
        [key: string]: { name: string; revenue: number };
      } = {};

      orderItems.forEach((item) => {
        if (item.order.branch) {
          const branchId = item.order.branch.id;
          if (!branchStats[branchId]) {
            branchStats[branchId] = {
              name: item.order.branch.name,
              revenue: 0,
            };
          }
          branchStats[branchId].revenue += Number(item.totalPrice);
        }
      });

      const labels = Object.values(branchStats).map((b) => b.name);
      const data = Object.values(branchStats).map((b) => b.revenue);

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

      return res.json({
        success: true,
        data: {
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
    } catch (error) {
      console.error("Error fetching branch revenue chart:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch branch revenue chart",
      });
    }
  },
};
