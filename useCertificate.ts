/**
 * @fileoverview useCertificate Hook
 * @description React hook for certificate blockchain management
 * @author EduVerse Platform
 * @date 2025-01-19
 *
 * This hook provides real-time certificate status and transaction functions:
 * - Reads certificate status from blockchain
 * - Prepares and sends mint/update/add transactions
 * - Auto-refreshes status after transactions
 * - Handles loading and error states
 * - Validates eligibility before transactions
 *
 * Usage:
 * ```typescript
 * const {
 *   hasCertificate,
 *   tokenId,
 *   certificate,
 *   stats,
 *   mintOrUpdateCertificate,
 *   updateCertificateImage,
 *   addMultipleCourses,
 *   checkEligibility,
 *   getQRData,
 *   loading,
 *   error
 * } = useCertificate();
 * ```
 */

"use client";

import {
  calculateBatchPrice,
  checkEligibilityForCertificate,
  generatePaymentHash,
  generateQRDataFromContract,
  getCertificateCompletedCourses,
  getCertificateDetails,
  getCertificatePrice,
  getLearningJourneySummary,
  getUserCertificateId,
  getUserCertificateStats,
  prepareAddMultipleCoursesTransaction,
  prepareMintOrUpdateCertificateTransaction,
  prepareUpdateCertificateTransaction,
  verifyCertificate,
  type Certificate,
  type CertificateEligibility,
  type CertificateStats,
  type LearningJourney,
} from "@/services/certificate-blockchain.service";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";

// ============================================================================
// HOOK RETURN TYPE
// ============================================================================

export interface UseCertificateReturn {
  // Certificate Status
  hasCertificate: boolean;
  tokenId: bigint | null;
  certificate: Certificate | null;
  stats: CertificateStats | null;
  completedCourses: bigint[];
  isValid: boolean;

  // Transaction Functions
  mintOrUpdateCertificate: (
    courseId: bigint,
    recipientName: string,
    ipfsCID: string,
    baseRoute: string
  ) => Promise<void>;
  updateCertificateImage: (newIpfsCID: string) => Promise<void>;
  addMultipleCourses: (courseIds: bigint[], ipfsCID: string) => Promise<void>;

  // Utility Functions
  refreshData: () => Promise<void>;
  checkEligibility: (courseId: bigint) => Promise<CertificateEligibility>;
  getQRData: () => Promise<string>;
  getLearningJourney: () => Promise<LearningJourney | null>;

  // Loading States
  loading: boolean;
  isMinting: boolean;
  isUpdating: boolean;
  isAdding: boolean;
  isTransactionPending: boolean;

  // Errors
  error: string | null;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for managing certificate blockchain operations
 *
 * @param options - Optional configuration
 * @returns Certificate status and transaction functions
 *
 * @example
 * ```typescript
 * function CertificateSection({ courseId }) {
 *   const { hasCertificate, mintOrUpdateCertificate, checkEligibility, loading } = useCertificate();
 *
 *   const handlePurchase = async () => {
 *     const eligibility = await checkEligibility(courseId);
 *     if (eligibility.eligible) {
 *       await mintOrUpdateCertificate(
 *         courseId,
 *         "John Doe",
 *         "QmXxx...",
 *         "https://eduverse.com/verify"
 *       );
 *     }
 *   };
 *
 *   if (loading) return <Spinner />;
 *   if (hasCertificate) return <CertificateDisplay />;
 *   return <PurchaseButton onClick={handlePurchase} />;
 * }
 * ```
 */
export function useCertificate(
  options: {
    autoRefresh?: boolean;
    refreshInterval?: number;
  } = {}
): UseCertificateReturn {
  const { autoRefresh = false, refreshInterval = 30000 } = options;

  const account = useActiveAccount();

  // State
  const [hasCertificate, setHasCertificate] = useState(false);
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [stats, setStats] = useState<CertificateStats | null>(null);
  const [completedCourses, setCompletedCourses] = useState<bigint[]>([]);
  const [isValid, setIsValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transaction states
  const [isMinting, setIsMinting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Thirdweb transaction hook
  const {
    mutate: sendTransaction,
    isPending: isTransactionPending,
    data: transactionResult,
  } = useSendTransaction();

  /**
   * Load certificate data from blockchain
   */
  const loadCertificateData = useCallback(async () => {
    if (!account) {
      setHasCertificate(false);
      setTokenId(null);
      setCertificate(null);
      setStats(null);
      setCompletedCourses([]);
      setIsValid(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get user's certificate ID
      const userTokenId = await getUserCertificateId(account.address);
      setTokenId(userTokenId);
      setHasCertificate(userTokenId > BigInt(0));

      if (userTokenId > BigInt(0)) {
        // Load full data
        const [certDetails, certStats, courses, validity] = await Promise.all([
          getCertificateDetails(userTokenId),
          getUserCertificateStats(account.address),
          getCertificateCompletedCourses(userTokenId),
          verifyCertificate(userTokenId),
        ]);

        setCertificate(certDetails);
        setStats(certStats);
        setCompletedCourses(courses);
        setIsValid(validity);
      } else {
        setCertificate(null);
        setStats(null);
        setCompletedCourses([]);
        setIsValid(false);
      }
    } catch (err) {
      console.error("Error loading certificate data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load certificate data"
      );
    } finally {
      setLoading(false);
    }
  }, [account]);

  /**
   * Refresh certificate data
   */
  const refreshData = useCallback(async () => {
    await loadCertificateData();
  }, [loadCertificateData]);

  /**
   * Handle transaction results with toast notifications
   */
  useEffect(() => {
    if (transactionResult) {
      const txHash = transactionResult.transactionHash;
      const explorerUrl = `https://pacific-explorer.manta.network/tx/${txHash}`;

      toast.success(
        `Transaction successful! View on Explorer: ${explorerUrl}`,
        {
          duration: 6000,
          style: {
            maxWidth: "500px",
          },
        }
      );

      // Refresh data after successful transaction
      refreshData();
    }
  }, [transactionResult, refreshData]);

  /**
   * Check eligibility for adding a course to certificate
   */
  const checkEligibility = useCallback(
    async (courseId: bigint): Promise<CertificateEligibility> => {
      if (!account) {
        return {
          eligible: false,
          isFirstCertificate: false,
          reason: "Wallet not connected",
        };
      }

      return await checkEligibilityForCertificate(account.address, courseId);
    },
    [account]
  );

  /**
   * Get QR code verification data
   */
  const getQRData = useCallback(async (): Promise<string> => {
    if (!tokenId || tokenId === BigInt(0)) {
      throw new Error("No certificate found");
    }

    return await generateQRDataFromContract(tokenId);
  }, [tokenId]);

  /**
   * Get learning journey summary
   */
  const getLearningJourney =
    useCallback(async (): Promise<LearningJourney | null> => {
      if (!tokenId || tokenId === BigInt(0)) {
        return null;
      }

      return await getLearningJourneySummary(tokenId);
    }, [tokenId]);

  /**
   * Mint first certificate OR add course to existing certificate
   */
  const mintOrUpdateCertificate = useCallback(
    async (
      courseId: bigint,
      recipientName: string,
      ipfsCID: string,
      baseRoute: string
    ) => {
      if (!account) {
        toast.error("Please connect your wallet first");
        throw new Error("Wallet not connected");
      }

      setIsMinting(true);
      setError(null);

      const loadingToast = toast.loading(
        "Processing certificate transaction..."
      );

      try {
        // 1. Check eligibility
        const eligibility = await checkEligibility(courseId);
        if (!eligibility.eligible) {
          throw new Error(eligibility.reason || "Not eligible for certificate");
        }

        // 2. Calculate price
        const price = await getCertificatePrice(
          courseId,
          eligibility.isFirstCertificate
        );

        // 3. Generate payment hash
        const paymentHash = generatePaymentHash(
          account.address,
          courseId,
          Date.now(),
          crypto.randomUUID()
        );

        // 4. Prepare transaction
        const transaction = await prepareMintOrUpdateCertificateTransaction(
          courseId,
          recipientName,
          ipfsCID,
          paymentHash,
          baseRoute,
          price
        );

        // 5. Send transaction
        await new Promise<void>((resolve, reject) => {
          sendTransaction(transaction, {
            onSuccess: () => {
              console.log("Certificate transaction successful");
              resolve();
            },
            onError: (error) => {
              console.error("Certificate transaction failed:", error);
              reject(error);
            },
          });
        });

        // 6. Refresh data
        await refreshData();
        toast.dismiss(loadingToast);
      } catch (err) {
        console.error("Error minting/updating certificate:", err);
        const errorMsg =
          err instanceof Error ? err.message : "Failed to process certificate";
        setError(errorMsg);
        toast.dismiss(loadingToast);
        toast.error(errorMsg);
        throw new Error(errorMsg);
      } finally {
        setIsMinting(false);
      }
    },
    [account, checkEligibility, sendTransaction, refreshData]
  );

  /**
   * Update certificate image (IPFS CID) only
   */
  const updateCertificateImage = useCallback(
    async (newIpfsCID: string) => {
      if (!account) {
        throw new Error("Wallet not connected");
      }

      if (!tokenId || tokenId === BigInt(0)) {
        throw new Error("No certificate found");
      }

      setIsUpdating(true);
      setError(null);

      try {
        // 1. Generate payment hash
        const paymentHash = generatePaymentHash(
          account.address,
          BigInt(0), // 0 for update operations
          Date.now(),
          crypto.randomUUID()
        );

        // 2. Use default update price (0.0001 ETH typically)
        // Query from contract or use known default
        const updatePrice = BigInt("100000000000000"); // 0.0001 ETH

        // 3. Prepare transaction
        const transaction = await prepareUpdateCertificateTransaction(
          tokenId,
          newIpfsCID,
          paymentHash,
          updatePrice
        );

        // 4. Send transaction
        await new Promise<void>((resolve, reject) => {
          sendTransaction(transaction, {
            onSuccess: () => {
              console.log("Certificate update successful");
              resolve();
            },
            onError: (error) => {
              console.error("Certificate update failed:", error);
              reject(error);
            },
          });
        });

        // 5. Refresh data
        await refreshData();
      } catch (err) {
        console.error("Error updating certificate:", err);
        const errorMsg =
          err instanceof Error ? err.message : "Failed to update certificate";
        setError(errorMsg);
        throw new Error(errorMsg);
      } finally {
        setIsUpdating(false);
      }
    },
    [account, tokenId, sendTransaction, refreshData]
  );

  /**
   * Add multiple courses to certificate in one transaction
   */
  const addMultipleCourses = useCallback(
    async (courseIds: bigint[], ipfsCID: string) => {
      if (!account) {
        throw new Error("Wallet not connected");
      }

      if (!tokenId || tokenId === BigInt(0)) {
        throw new Error("No certificate found");
      }

      if (courseIds.length === 0) {
        throw new Error("No courses provided");
      }

      setIsAdding(true);
      setError(null);

      try {
        // 1. Check eligibility for all courses
        for (const courseId of courseIds) {
          const eligibility = await checkEligibility(courseId);
          if (!eligibility.eligible) {
            throw new Error(
              `Course ${courseId} not eligible: ${eligibility.reason}`
            );
          }
        }

        // 2. Calculate total price
        const totalPrice = await calculateBatchPrice(courseIds, true);

        // 3. Generate payment hash
        const paymentHash = generatePaymentHash(
          account.address,
          BigInt(0), // 0 for batch operations
          Date.now(),
          crypto.randomUUID()
        );

        // 4. Prepare transaction
        const transaction = await prepareAddMultipleCoursesTransaction(
          courseIds,
          ipfsCID,
          paymentHash,
          totalPrice
        );

        // 5. Send transaction
        await new Promise<void>((resolve, reject) => {
          sendTransaction(transaction, {
            onSuccess: () => {
              console.log("Batch course addition successful");
              resolve();
            },
            onError: (error) => {
              console.error("Batch course addition failed:", error);
              reject(error);
            },
          });
        });

        // 6. Refresh data
        await refreshData();
      } catch (err) {
        console.error("Error adding courses:", err);
        const errorMsg =
          err instanceof Error ? err.message : "Failed to add courses";
        setError(errorMsg);
        throw new Error(errorMsg);
      } finally {
        setIsAdding(false);
      }
    },
    [account, tokenId, checkEligibility, sendTransaction, refreshData]
  );

  // Load data on mount and when account changes
  useEffect(() => {
    loadCertificateData();
  }, [loadCertificateData]);

  // Auto-refresh if enabled
  useEffect(() => {
    if (autoRefresh && account) {
      const interval = setInterval(() => {
        loadCertificateData();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, account, loadCertificateData]);

  return {
    // Status
    hasCertificate,
    tokenId,
    certificate,
    stats,
    completedCourses,
    isValid,

    // Actions
    mintOrUpdateCertificate,
    updateCertificateImage,
    addMultipleCourses,

    // Utilities
    refreshData,
    checkEligibility,
    getQRData,
    getLearningJourney,

    // Loading
    loading,
    isMinting,
    isUpdating,
    isAdding,
    isTransactionPending,

    // Errors
    error,
  };
}

// ============================================================================
// COMPANION HOOKS
// ============================================================================

/**
 * Read-only certificate status hook (no transactions)
 *
 * @param address - Wallet address to check
 * @returns Certificate status data
 *
 * @example
 * ```typescript
 * function CertificateVerification({ address }) {
 *   const { hasCertificate, stats, isValid, loading } = useCertificateStatus(address);
 *
 *   if (loading) return <Spinner />;
 *   if (!hasCertificate) return <NoCertificate />;
 *
 *   return (
 *     <div>
 *       <p>Valid: {isValid ? 'Yes' : 'No'}</p>
 *       <p>Total Courses: {stats?.totalCourses.toString()}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useCertificateStatus(address: string | undefined) {
  const [hasCertificate, setHasCertificate] = useState(false);
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [stats, setStats] = useState<CertificateStats | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStatus() {
      if (!address) {
        setHasCertificate(false);
        setTokenId(null);
        setStats(null);
        setIsValid(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const userTokenId = await getUserCertificateId(address);
        setTokenId(userTokenId);
        setHasCertificate(userTokenId > BigInt(0));

        if (userTokenId > BigInt(0)) {
          const [certStats, validity] = await Promise.all([
            getUserCertificateStats(address),
            verifyCertificate(userTokenId),
          ]);

          setStats(certStats);
          setIsValid(validity);
        } else {
          setStats(null);
          setIsValid(false);
        }
      } catch (error) {
        console.error("Error loading certificate status:", error);
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, [address]);

  return {
    hasCertificate,
    tokenId,
    stats,
    isValid,
    loading,
  };
}

/**
 * Check eligibility for a specific course certificate
 *
 * @param courseId - Course ID to check
 * @returns Eligibility status and price
 *
 * @example
 * ```typescript
 * function CertificatePurchaseButton({ courseId }) {
 *   const { eligible, isFirstCertificate, price, reason, loading } = useCertificateEligibility(courseId);
 *
 *   if (loading) return <Spinner />;
 *   if (!eligible) return <Alert>{reason}</Alert>;
 *
 *   return (
 *     <Button>
 *       {isFirstCertificate ? 'Mint Certificate' : 'Add to Certificate'} - {price} ETH
 *     </Button>
 *   );
 * }
 * ```
 */
export function useCertificateEligibility(courseId: bigint | undefined) {
  const account = useActiveAccount();
  const [eligible, setEligible] = useState(false);
  const [isFirstCertificate, setIsFirstCertificate] = useState(false);
  const [price, setPrice] = useState<bigint | null>(null);
  const [reason, setReason] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkElig() {
      if (!account || !courseId) {
        setEligible(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const eligibility = await checkEligibilityForCertificate(
          account.address,
          courseId
        );

        setEligible(eligibility.eligible);
        setIsFirstCertificate(eligibility.isFirstCertificate);
        setReason(eligibility.reason);

        if (eligibility.eligible) {
          const certPrice = await getCertificatePrice(
            courseId,
            eligibility.isFirstCertificate
          );
          setPrice(certPrice);
        } else {
          setPrice(null);
        }
      } catch (error) {
        console.error("Error checking eligibility:", error);
        setEligible(false);
        setReason("Error checking eligibility");
      } finally {
        setLoading(false);
      }
    }

    checkElig();
  }, [account, courseId]);

  return {
    eligible,
    isFirstCertificate,
    price,
    reason,
    loading,
  };
}

/**
 * Public certificate verification hook (for landing pages)
 *
 * @param tokenId - Certificate token ID to verify
 * @returns Public verification data
 *
 * @example
 * ```typescript
 * function CertificateVerificationPage({ tokenId }) {
 *   const { isValid, journey, qrData, completedCourses, loading } = useCertificateVerification(BigInt(tokenId));
 *
 *   if (loading) return <Spinner />;
 *   if (!isValid) return <InvalidCertificate />;
 *
 *   return (
 *     <div>
 *       <h1>{journey?.recipientName}'s Certificate</h1>
 *       <p>{journey?.platformName}</p>
 *       <p>Courses: {journey?.totalCourses.toString()}</p>
 *       <QRCode value={qrData} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useCertificateVerification(tokenId: bigint | undefined) {
  const [isValid, setIsValid] = useState(false);
  const [journey, setJourney] = useState<LearningJourney | null>(null);
  const [qrData, setQrData] = useState<string>("");
  const [completedCourses, setCompletedCourses] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verify() {
      if (!tokenId || tokenId === BigInt(0)) {
        setIsValid(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [validity, journeyData, qr, courses] = await Promise.all([
          verifyCertificate(tokenId),
          getLearningJourneySummary(tokenId),
          generateQRDataFromContract(tokenId),
          getCertificateCompletedCourses(tokenId),
        ]);

        setIsValid(validity);
        setJourney(journeyData);
        setQrData(qr);
        setCompletedCourses(courses);
      } catch (error) {
        console.error("Error verifying certificate:", error);
        setIsValid(false);
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [tokenId]);

  return {
    isValid,
    journey,
    qrData,
    completedCourses,
    loading,
  };
}
