import { Request, Response } from "express";
import { AuthenticatedRequest } from "../types";
import DatabaseSingleton from "../config/database";
import { PolicyType } from "@prisma/client";

export class TermsAndPolicyController {
  // Get active policies by type and language (public endpoint)
  public getActivePolicy = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { type, language = "en" } = req.query;

      if (!type) {
        res.status(400).json({
          success: false,
          error: "Policy type is required",
        });
        return;
      }

      // First, let's see ALL policies in the database for debugging
      const allPoliciesInDb = await prisma.termsAndPolicy.findMany({
        select: {
          id: true,
          type: true,
          title: true,
          language: true,
          version: true,
          isActive: true,
          isRequired: true,
        },
      });

      const policy = await prisma.termsAndPolicy.findFirst({
        where: {
          type: type as PolicyType,
          language: language as string,
          isActive: true,
        },
        orderBy: { effectiveDate: "desc" },
      });

      if (policy) {
      } else {
        // Check if any policies exist at all for debugging
        const allPolicies = await prisma.termsAndPolicy.findMany({
          where: {
            type: type as PolicyType,
            language: language as string,
          },
        });
        
        if (allPolicies.length > 0) {
        } else {
          // Try to find policies with same language but different type
          const similarPolicies = await prisma.termsAndPolicy.findMany({
            where: {
              language: language as string,
            },
            take: 5,
          });
          if (similarPolicies.length > 0) {
          }
        }
      }

      if (!policy) {
        res.status(200).json({
          success: false,
          data: null,
          error: "No active policy found for this type and language",
        });
        return;
      }
      res.json({
        success: true,
        data: policy,
      });
    } catch (error) {
      console.error("❌ [TermsAndPolicy] Error fetching active policy:", error);
      console.error("❌ [TermsAndPolicy] Error stack:", error instanceof Error ? error.stack : "No stack trace");
      res.status(500).json({
        success: false,
        error: "Failed to fetch active policy",
      });
    }
  };

  // Get all active policies (public endpoint - for displaying all policies)
  public getAllActivePolicies = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { language = "en" } = req.query;

      const policies = await prisma.termsAndPolicy.findMany({
        where: {
          language: language as string,
          isActive: true,
        },
        orderBy: [
          { type: "asc" },
          { effectiveDate: "desc" },
        ],
      });

      res.json({
        success: true,
        data: policies,
      });
    } catch (error) {
      console.error("Error fetching active policies:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch active policies",
      });
    }
  };

  // Get all policies (admin only)
  public getAllPolicies = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { type, language, isActive } = req.query;

      const where: any = {};
      if (type) where.type = type as PolicyType;
      if (language) where.language = language;
      if (isActive !== undefined) where.isActive = isActive === "true";

      const policies = await prisma.termsAndPolicy.findMany({
        where,
        orderBy: [
          { type: "asc" },
          { language: "asc" },
          { version: "desc" },
        ],
        include: {
          _count: {
            select: {
              userConsents: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: policies,
      });
    } catch (error) {
      console.error("Error fetching policies:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch policies",
      });
    }
  };

  // Get policy by ID (admin only)
  public getPolicyById = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { id } = req.params;

      const policy = await prisma.termsAndPolicy.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              userConsents: true,
            },
          },
        },
      });

      if (!policy) {
        res.status(404).json({
          success: false,
          error: "Policy not found",
        });
        return;
      }

      res.json({
        success: true,
        data: policy,
      });
    } catch (error) {
      console.error("Error fetching policy:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch policy",
      });
    }
  };

  // Create policy (admin only)
  public createPolicy = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const {
        type,
        title,
        content,
        language = "en",
        version,
        effectiveDate,
        isActive = false,
        isRequired = true,
      } = req.body;

      // Validate required fields
      if (!type || !title || !content || !version || !effectiveDate) {
        res.status(400).json({
          success: false,
          error: "Type, title, content, version, and effectiveDate are required",
        });
        return;
      }

      // Check if version already exists for this type+language
      const existingVersion = await prisma.termsAndPolicy.findFirst({
        where: {
          type: type as PolicyType,
          language: language,
          version: version,
        },
      });

      if (existingVersion) {
        res.status(400).json({
          success: false,
          error: `Version ${version} already exists for ${type} in ${language}`,
        });
        return;
      }

      // If setting this as active, deactivate all other policies of the same type+language
      if (isActive === true) {
        await prisma.termsAndPolicy.updateMany({
          where: {
            type: type as PolicyType,
            language: language,
            isActive: true,
          },
          data: { isActive: false },
        });
      }

      const policy = await prisma.termsAndPolicy.create({
        data: {
          type: type as PolicyType,
          title,
          content,
          language,
          version,
          effectiveDate: new Date(effectiveDate),
          isActive,
          isRequired,
          createdBy: req.user?.id || null,
        },
      });

      // If this is a new required policy, reset all users' signatures
      // They will need to accept the new policy
      if (isRequired && isActive) {
        await prisma.user.updateMany({
          data: { hasAcceptedRequiredPolicies: false },
        });
      }

      res.json({
        success: true,
        data: policy,
        message: "Policy created successfully",
      });
    } catch (error: any) {
      console.error("Error creating policy:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to create policy",
      });
    }
  };

  // Update policy (admin only)
  public updatePolicy = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { id } = req.params;

      const {
        title,
        content,
        effectiveDate,
        isActive,
        isRequired,
      } = req.body;

      // Check if policy exists
      const existingPolicy = await prisma.termsAndPolicy.findUnique({
        where: { id },
      });

      if (!existingPolicy) {
        res.status(404).json({
          success: false,
          error: "Policy not found",
        });
        return;
      }

      // If setting this as active, deactivate all other policies of the same type+language
      if (isActive === true) {
        await prisma.termsAndPolicy.updateMany({
          where: {
            type: existingPolicy.type,
            language: existingPolicy.language,
            isActive: true,
            id: { not: id },
          },
          data: { isActive: false },
        });
      }

      // If this policy is being set as required and active, reset all user signatures
      // Users will need to accept the updated required policy
      if (isRequired === true && isActive === true && (!existingPolicy.isRequired || !existingPolicy.isActive)) {
        await prisma.user.updateMany({
          data: { hasAcceptedRequiredPolicies: false },
        });
      }

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (effectiveDate !== undefined)
        updateData.effectiveDate = new Date(effectiveDate);
      if (isActive !== undefined) updateData.isActive = isActive;
      if (isRequired !== undefined) updateData.isRequired = isRequired;

      const updatedPolicy = await prisma.termsAndPolicy.update({
        where: { id },
        data: updateData,
      });

      res.json({
        success: true,
        data: updatedPolicy,
        message: "Policy updated successfully",
      });
    } catch (error) {
      console.error("Error updating policy:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update policy",
      });
    }
  };

  // Delete policy (admin only)
  public deletePolicy = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { id } = req.params;

      // Check if policy exists
      const existingPolicy = await prisma.termsAndPolicy.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              userConsents: true,
            },
          },
        },
      });

      if (!existingPolicy) {
        res.status(404).json({
          success: false,
          error: "Policy not found",
        });
        return;
      }

      // Warn if policy has user consents (GDPR - we should keep records)
      if (existingPolicy._count.userConsents > 0) {
        res.status(400).json({
          success: false,
          error: `Cannot delete policy with ${existingPolicy._count.userConsents} user consents. Deactivate it instead.`,
        });
        return;
      }

      await prisma.termsAndPolicy.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Policy deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting policy:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete policy",
      });
    }
  };

  // Get user consents for a policy (admin only)
  public getPolicyConsents = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { id } = req.params;
      const { page = "1", limit = "50" } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const [consents, totalCount] = await Promise.all([
        prisma.policyUserConsent.findMany({
          where: { policyId: id },
          orderBy: { consentedAt: "desc" },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.policyUserConsent.count({
          where: { policyId: id },
        }),
      ]);

      res.json({
        success: true,
        data: {
          consents,
          pagination: {
            currentPage: parseInt(page as string),
            totalPages: Math.ceil(totalCount / parseInt(limit as string)),
            totalCount,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching policy consents:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch policy consents",
      });
    }
  };

  // Record user consent (user endpoint)
  public recordUserConsent = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const { policyId } = req.body;

      if (!policyId) {
        res.status(400).json({
          success: false,
          error: "Policy ID is required",
        });
        return;
      }

      // Get user ID from request (set by auth middleware)
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
        return;
      }

      // Verify policy exists and is active
      const policy = await prisma.termsAndPolicy.findUnique({
        where: { id: policyId },
      });

      if (!policy) {
        res.status(404).json({
          success: false,
          error: "Policy not found",
        });
        return;
      }

      if (!policy.isActive) {
        res.status(400).json({
          success: false,
          error: "Cannot consent to inactive policy",
        });
        return;
      }

      // Check if consent already exists
      const existingConsent = await prisma.policyUserConsent.findUnique({
        where: {
          userId_policyId_policyVersion: {
            userId,
            policyId,
            policyVersion: policy.version,
          },
        },
      });

      if (existingConsent) {
        // Still check if signature needs to be updated (in case it was reset)
        // Check if user has now accepted all required policies
        const requiredPolicies = await prisma.termsAndPolicy.findMany({
          where: {
            isActive: true,
            isRequired: true,
          },
        });

        if (requiredPolicies.length > 0) {
          // Get all user's consents
          const userConsents = await prisma.policyUserConsent.findMany({
            where: { userId },
            select: {
              policyId: true,
              policyVersion: true,
            },
          });

          // Check if user has consented to all required policies
          const allAccepted = requiredPolicies.every((reqPolicy) => {
            return userConsents.some(
              (consent) =>
                consent.policyId === reqPolicy.id &&
                consent.policyVersion === reqPolicy.version
            );
          });

          // Update user's signature if all required policies are accepted
          if (allAccepted) {
            await prisma.user.update({
              where: { id: userId },
              data: { hasAcceptedRequiredPolicies: true },
            });
          }
        }

        res.json({
          success: true,
          data: existingConsent,
          message: "Consent already recorded",
        });
        return;
      }

      // Get IP address and user agent for audit trail
      const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
      const userAgent = req.headers["user-agent"] || null;

      // Create consent record
      const consent = await prisma.policyUserConsent.create({
        data: {
          userId,
          policyId,
          policyVersion: policy.version,
          ipAddress: ipAddress as string | null,
          userAgent,
          consentMethod: "EXPLICIT",
        },
      });

      // Check if user has now accepted all required policies
      const requiredPolicies = await prisma.termsAndPolicy.findMany({
        where: {
          isActive: true,
          isRequired: true,
        },
      });

      if (requiredPolicies.length > 0) {
        // Get all user's consents
        const userConsents = await prisma.policyUserConsent.findMany({
          where: { userId },
          select: {
            policyId: true,
            policyVersion: true,
          },
        });

        // Check if user has consented to all required policies
        const allAccepted = requiredPolicies.every((reqPolicy) => {
          return userConsents.some(
            (consent) =>
              consent.policyId === reqPolicy.id &&
              consent.policyVersion === reqPolicy.version
          );
        });

        // Update user's signature if all required policies are accepted
        if (allAccepted) {
          await prisma.user.update({
            where: { id: userId },
            data: { hasAcceptedRequiredPolicies: true },
          });
        } else {
        }
      }

      res.json({
        success: true,
        data: consent,
        message: "Consent recorded successfully",
      });
    } catch (error: any) {
      console.error("Error recording user consent:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to record consent",
      });
    }
  };

  // Get user's consents (user endpoint)
  public getUserConsents = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
        return;
      }

      const consents = await prisma.policyUserConsent.findMany({
        where: { userId },
        include: {
          policy: {
            select: {
              id: true,
              type: true,
              title: true,
              version: true,
              effectiveDate: true,
            },
          },
        },
        orderBy: { consentedAt: "desc" },
      });

      res.json({
        success: true,
        data: consents,
      });
    } catch (error) {
      console.error("Error fetching user consents:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user consents",
      });
    }
  };

  // Get required policies that user hasn't consented to (user endpoint)
  public getRequiredPoliciesForUser = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
        return;
      }

      const { language = "en" } = req.query;

      // Get all required active policies
      const requiredPolicies = await prisma.termsAndPolicy.findMany({
        where: {
          language: language as string,
          isActive: true,
          isRequired: true,
        },
        orderBy: { type: "asc" },
      });

      // Get user's existing consents
      const userConsents = await prisma.policyUserConsent.findMany({
        where: { userId },
        select: {
          policyId: true,
          policyVersion: true,
        },
      });

      // Filter out policies user has already consented to
      const pendingPolicies = requiredPolicies.filter((policy) => {
        const hasConsent = userConsents.some(
          (consent) =>
            consent.policyId === policy.id &&
            consent.policyVersion === policy.version
        );
        return !hasConsent;
      });

      res.json({
        success: true,
        data: pendingPolicies,
      });
    } catch (error) {
      console.error("Error fetching required policies:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch required policies",
      });
    }
  };
}

