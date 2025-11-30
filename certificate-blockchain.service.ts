/**
 * @fileoverview Certificate Blockchain Service (Thirdweb SDK)
 * @description Handles blockchain interactions with CertificateManager contract
 * @author EduVerse Platform
 * @date 2025-01-19
 *
 * This service provides functions to interact with the CertificateManager smart contract:
 * - prepareMintOrUpdateCertificateTransaction(): Prepare transaction to mint first certificate or add course
 * - prepareUpdateCertificateTransaction(): Prepare transaction to update certificate IPFS CID
 * - prepareAddMultipleCoursesTransaction(): Prepare transaction to add multiple courses efficiently
 * - getCertificateDetails(): Retrieve full certificate information
 * - getUserCertificateId(): Get user's certificate token ID
 * - getUserCertificateStats(): Get certificate statistics
 * - getCertificateCompletedCourses(): Get list of completed courses in certificate
 * - isCourseInCertificate(): Check if course is already in certificate
 * - getLearningJourneySummary(): Get public verification data
 * - generateQRDataFromContract(): Get QR code verification URL
 * - verifyCertificate(): Verify certificate validity
 * - getCertificatePrice(): Calculate price for certificate purchase/addition
 * - calculateBatchPrice(): Calculate total price for multiple courses
 * - generatePaymentHash(): Generate unique payment hash for replay protection
 * - checkEligibilityForCertificate(): Check if user can purchase/add certificate
 *
 * Smart Contract Integration:
 * - CertificateManager.sol with ERC-1155 multi-token standard
 * - "One Certificate Per User" model - each user has ONE tokenId that grows
 * - Soulbound NFT (non-transferable)
 * - Automatic course addition to existing certificates
 * - Events: CertificateMinted, CourseAddedToCertificate, CertificatePaymentRecorded
 *
 * Business Logic:
 * - One certificate per user (tokenId), grows with courses
 * - First certificate mint: 10% platform fee, 90% creator
 * - Course additions: 2% platform fee, 98% creator
 * - Prerequisites: Course must be completed + User must own/owned license
 * - License can be EXPIRED but still allow certificate purchase
 * - Payment hash prevents replay attacks
 * - QR code verification for public credential validation
 *
 * Certificate Structure (13 fields):
 * - tokenId: Unique NFT identifier
 * - platformName: "EduVerse" by default
 * - recipientName: User's display name
 * - recipientAddress: User's wallet address
 * - lifetimeFlag: Always true (permanent certificate)
 * - isValid: For revocation (admin only)
 * - ipfsCID: IPFS hash for certificate image (updated with each course)
 * - baseRoute: QR verification base URL
 * - issuedAt: First mint timestamp
 * - lastUpdated: Last course addition timestamp
 * - totalCoursesCompleted: Counter
 * - paymentReceiptHash: Unique payment identifier
 * - completedCourses: Array of course IDs
 *
 * Thirdweb SDK:
 * - Uses prepareContractCall() for transaction preparation
 * - Uses readContract() for reading blockchain data
 * - Components execute transactions with useSendTransaction() hook
 */

import {
  certificateManager,
  courseLicense,
  progressTracker,
} from "@/lib/contracts";
import { keccak256, encodePacked, stringToHex, toEther } from "thirdweb/utils";
import {
  prepareContractCall,
  readContract,
  type PreparedTransaction,
} from "thirdweb";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Certificate structure from CertificateManager.sol
 * Represents a user's lifetime learning certificate
 */
export interface Certificate {
  tokenId: bigint;
  platformName: string;
  recipientName: string;
  recipientAddress: string;
  lifetimeFlag: boolean; // Always true
  isValid: boolean; // For revocation
  ipfsCID: string; // Updated with each course
  baseRoute: string; // QR verification URL base
  issuedAt: bigint; // First mint timestamp
  lastUpdated: bigint; // Last course addition timestamp
  totalCoursesCompleted: bigint;
  paymentReceiptHash: string; // bytes32 as hex string
  completedCourses: bigint[]; // Array that grows
}

/**
 * Certificate statistics (efficient read)
 * Returned by getUserCertificateStats()
 */
export interface CertificateStats {
  tokenId: bigint;
  totalCourses: bigint;
  issuedAt: bigint;
  lastUpdated: bigint;
}

/**
 * Learning journey summary for public verification
 * Returned by getLearningJourneySummary()
 */
export interface LearningJourney {
  recipientName: string;
  platformName: string;
  totalCourses: bigint;
  issuedAt: bigint;
  lastUpdated: bigint;
  isValid: boolean;
}

/**
 * Certificate eligibility check result
 */
export interface CertificateEligibility {
  eligible: boolean;
  isFirstCertificate: boolean;
  reason?: string;
}

/**
 * Certificate price calculation result
 */
export interface CertificatePrice {
  basePrice: bigint; // Creator-set or default
  platformFeePercentage: number; // 10% for first mint, 2% for additions
  platformFee: bigint;
  creatorFee: bigint;
  totalRequired: bigint;
  priceInEth: string; // Formatted ETH string
}

// ============================================================================
// TRANSACTION PREPARATION FUNCTIONS
// ============================================================================

/**
 * Prepare transaction to mint first certificate OR add course to existing certificate
 *
 * This single function handles both scenarios:
 * - User has no certificate (tokenId = 0): MINT new certificate with 10% platform fee
 * - User has certificate (tokenId > 0): ADD course to existing with 2% platform fee
 *
 * Prerequisites (validated by contract):
 * - Course must be completed (progressTracker.isCourseCompleted)
 * - User must have owned license (courseLicense.getLicense) - can be expired
 * - Course not already in certificate (certificateCourseExists mapping)
 * - Payment hash not already used (usedPaymentHashes mapping)
 *
 * @param courseId - Course ID to add to certificate
 * @param recipientName - User's display name for certificate
 * @param ipfsCID - IPFS hash for certificate image
 * @param paymentHash - Unique payment hash (use generatePaymentHash())
 * @param baseRoute - QR verification base URL (e.g., "https://eduverse.com/verify")
 * @param totalPrice - Total payment amount in wei
 * @returns Prepared transaction ready to be sent
 *
 * @example
 * ```typescript
 * const price = await getCertificatePrice(courseId, true); // true = first certificate
 * const paymentHash = generatePaymentHash(address, courseId, Date.now(), crypto.randomUUID());
 * const tx = await prepareMintOrUpdateCertificateTransaction(
 *   courseId,
 *   "John Doe",
 *   "QmXxx...",
 *   paymentHash,
 *   "https://eduverse.com/verify",
 *   price
 * );
 * await sendTransaction(tx);
 * ```
 */
export async function prepareMintOrUpdateCertificateTransaction(
  courseId: bigint,
  recipientName: string,
  ipfsCID: string,
  paymentHash: string,
  baseRoute: string,
  totalPrice: bigint
): Promise<PreparedTransaction> {
  return prepareContractCall({
    contract: certificateManager,
    method:
      "function mintOrUpdateCertificate(uint256 courseId, string recipientName, string ipfsCID, bytes32 paymentReceiptHash, string baseRoute) payable",
    params: [
      courseId,
      recipientName,
      ipfsCID,
      paymentHash as `0x${string}`,
      baseRoute,
    ],
    value: totalPrice,
  });
}

/**
 * Prepare transaction to update certificate IPFS CID only (no course addition)
 *
 * Use case: User wants to update certificate image/design without adding new courses
 * Requires payment to prevent spam (uses course addition fee structure: 2%)
 *
 * @param tokenId - Certificate token ID
 * @param newIpfsCID - New IPFS hash for certificate image
 * @param paymentHash - Unique payment hash
 * @param updatePrice - Payment amount in wei (typically defaultCourseAdditionFee)
 * @returns Prepared transaction ready to be sent
 *
 * @example
 * ```typescript
 * const tokenId = await getUserCertificateId(address);
 * const paymentHash = generatePaymentHash(address, 0n, Date.now(), crypto.randomUUID());
 * const tx = await prepareUpdateCertificateTransaction(
 *   tokenId,
 *   "QmNew...",
 *   paymentHash,
 *   ethers.parseEther("0.0001") // 0.0001 ETH default
 * );
 * await sendTransaction(tx);
 * ```
 */
export async function prepareUpdateCertificateTransaction(
  tokenId: bigint,
  newIpfsCID: string,
  paymentHash: string,
  updatePrice: bigint
): Promise<PreparedTransaction> {
  return prepareContractCall({
    contract: certificateManager,
    method:
      "function updateCertificate(uint256 tokenId, string newIpfsCID, bytes32 paymentReceiptHash) payable",
    params: [tokenId, newIpfsCID, paymentHash as `0x${string}`],
    value: updatePrice,
  });
}

/**
 * Prepare transaction to add multiple courses to certificate in one transaction
 *
 * Gas-efficient batch operation for users who completed multiple courses
 * Validates ALL courses before processing (all must be completed, not duplicate, owned license)
 * Emits CourseAddedToCertificate event for EACH course (for Goldsky analytics)
 *
 * @param courseIds - Array of course IDs to add
 * @param ipfsCID - IPFS hash for updated certificate image
 * @param paymentHash - Unique payment hash
 * @param totalPrice - Total payment amount (sum of per-course addition fees)
 * @returns Prepared transaction ready to be sent
 *
 * @example
 * ```typescript
 * const courseIds = [1n, 2n, 3n];
 * const totalPrice = await calculateBatchPrice(courseIds, true);
 * const paymentHash = generatePaymentHash(address, 0n, Date.now(), crypto.randomUUID());
 * const tx = await prepareAddMultipleCoursesTransaction(
 *   courseIds,
 *   "QmBatch...",
 *   paymentHash,
 *   totalPrice
 * );
 * await sendTransaction(tx);
 * ```
 */
export async function prepareAddMultipleCoursesTransaction(
  courseIds: bigint[],
  ipfsCID: string,
  paymentHash: string,
  totalPrice: bigint
): Promise<PreparedTransaction> {
  return prepareContractCall({
    contract: certificateManager,
    method:
      "function addMultipleCoursesToCertificate(uint256[] courseIds, string ipfsCID, bytes32 paymentReceiptHash) payable",
    params: [courseIds, ipfsCID, paymentHash as `0x${string}`],
    value: totalPrice,
  });
}

// ============================================================================
// CONTRACT READ FUNCTIONS
// ============================================================================

/**
 * Get full certificate details by token ID
 *
 * @param tokenId - Certificate token ID
 * @returns Full certificate object with all 13 fields
 * @throws Error if certificate does not exist
 *
 * @example
 * ```typescript
 * const certificate = await getCertificateDetails(1n);
 * console.log(certificate.recipientName); // "John Doe"
 * console.log(certificate.totalCoursesCompleted); // 5n
 * console.log(certificate.completedCourses); // [1n, 2n, 3n, 4n, 5n]
 * ```
 */
export async function getCertificateDetails(
  tokenId: bigint
): Promise<Certificate> {
  const result = await readContract({
    contract: certificateManager,
    method:
      "function getCertificate(uint256 tokenId) view returns ((uint256 tokenId, string platformName, string recipientName, address recipientAddress, bool lifetimeFlag, bool isValid, string ipfsCID, string baseRoute, uint256 issuedAt, uint256 lastUpdated, uint256 totalCoursesCompleted, bytes32 paymentReceiptHash, uint256[] completedCourses))",
    params: [tokenId],
  });

  return {
    tokenId: result.tokenId,
    platformName: result.platformName,
    recipientName: result.recipientName,
    recipientAddress: result.recipientAddress,
    lifetimeFlag: result.lifetimeFlag,
    isValid: result.isValid,
    ipfsCID: result.ipfsCID,
    baseRoute: result.baseRoute,
    issuedAt: result.issuedAt,
    lastUpdated: result.lastUpdated,
    totalCoursesCompleted: result.totalCoursesCompleted,
    paymentReceiptHash: result.paymentReceiptHash,
    completedCourses: [...result.completedCourses], // Copy readonly array
  };
}

/**
 * Get user's certificate token ID
 *
 * @param userAddress - User's wallet address
 * @returns Token ID (0 if user has no certificate)
 *
 * @example
 * ```typescript
 * const tokenId = await getUserCertificateId("0x123...");
 * if (tokenId === 0n) {
 *   console.log("User has no certificate");
 * } else {
 *   console.log(`User's certificate ID: ${tokenId}`);
 * }
 * ```
 */
export async function getUserCertificateId(
  userAddress: string
): Promise<bigint> {
  return await readContract({
    contract: certificateManager,
    method: "function getUserCertificate(address user) view returns (uint256)",
    params: [userAddress],
  });
}

/**
 * Get certificate statistics (efficient read, only 4 fields)
 *
 * More efficient than getCertificateDetails() when you only need summary info
 *
 * @param userAddress - User's wallet address
 * @returns Certificate stats or null if no certificate
 *
 * @example
 * ```typescript
 * const stats = await getUserCertificateStats("0x123...");
 * if (stats) {
 *   console.log(`Completed ${stats.totalCourses} courses`);
 *   console.log(`Issued: ${new Date(Number(stats.issuedAt) * 1000)}`);
 * }
 * ```
 */
export async function getUserCertificateStats(
  userAddress: string
): Promise<CertificateStats | null> {
  const result = await readContract({
    contract: certificateManager,
    method:
      "function getUserCertificateStats(address user) view returns (uint256 tokenId, uint256 totalCourses, uint256 issuedAt, uint256 lastUpdated)",
    params: [userAddress],
  });

  // If tokenId is 0, user has no certificate
  if (result[0] === BigInt(0)) {
    return null;
  }

  return {
    tokenId: result[0],
    totalCourses: result[1],
    issuedAt: result[2],
    lastUpdated: result[3],
  };
}

/**
 * Check if user has a certificate
 *
 * @param userAddress - User's wallet address
 * @returns Boolean indicating certificate existence
 *
 * @example
 * ```typescript
 * const hasIt = await hasCertificate("0x123...");
 * console.log(hasIt ? "Has certificate" : "No certificate");
 * ```
 */
export async function hasCertificate(userAddress: string): Promise<boolean> {
  const tokenId = await getUserCertificateId(userAddress);
  return tokenId > BigInt(0);
}

/**
 * Get list of completed courses in certificate
 *
 * @param tokenId - Certificate token ID
 * @returns Array of course IDs
 * @throws Error if certificate does not exist
 *
 * @example
 * ```typescript
 * const courses = await getCertificateCompletedCourses(1n);
 * console.log(`Completed courses: ${courses.join(", ")}`);
 * ```
 */
export async function getCertificateCompletedCourses(
  tokenId: bigint
): Promise<bigint[]> {
  const result = await readContract({
    contract: certificateManager,
    method:
      "function getCertificateCompletedCourses(uint256 tokenId) view returns (uint256[])",
    params: [tokenId],
  });
  return [...result]; // Copy readonly array
}

/**
 * Check if specific course is in certificate
 *
 * @param tokenId - Certificate token ID
 * @param courseId - Course ID to check
 * @returns Boolean indicating if course is in certificate
 *
 * @example
 * ```typescript
 * const exists = await isCourseInCertificate(1n, 5n);
 * if (exists) {
 *   console.log("Course already in certificate");
 * }
 * ```
 */
export async function isCourseInCertificate(
  tokenId: bigint,
  courseId: bigint
): Promise<boolean> {
  return await readContract({
    contract: certificateManager,
    method:
      "function isCourseInCertificate(uint256 tokenId, uint256 courseId) view returns (bool)",
    params: [tokenId, courseId],
  });
}

/**
 * Get learning journey summary for public verification
 *
 * Used for QR code landing pages and public credential verification
 * Returns only public-safe information (no wallet address, no payment hash)
 *
 * @param tokenId - Certificate token ID
 * @returns Learning journey summary
 * @throws Error if certificate does not exist
 *
 * @example
 * ```typescript
 * const journey = await getLearningJourneySummary(1n);
 * console.log(`${journey.recipientName} completed ${journey.totalCourses} courses on ${journey.platformName}`);
 * console.log(`Valid: ${journey.isValid}`);
 * ```
 */
export async function getLearningJourneySummary(
  tokenId: bigint
): Promise<LearningJourney> {
  const result = await readContract({
    contract: certificateManager,
    method:
      "function getLearningJourneySummary(uint256 tokenId) view returns (string recipientName, string platformName, uint256 totalCourses, uint256 issuedAt, uint256 lastUpdated, bool isValid)",
    params: [tokenId],
  });

  return {
    recipientName: result[0],
    platformName: result[1],
    totalCourses: result[2],
    issuedAt: result[3],
    lastUpdated: result[4],
    isValid: result[5],
  };
}

/**
 * Generate QR code verification URL from contract
 *
 * Format: baseRoute + "?address=<recipientAddress>&tokenId=<tokenId>&courses=<totalCourses>"
 * Example: "https://eduverse.com/verify?address=0x123...&tokenId=1&courses=5"
 *
 * @param tokenId - Certificate token ID
 * @returns QR code data string (empty string if baseRoute not set)
 * @throws Error if certificate does not exist
 *
 * @example
 * ```typescript
 * const qrData = await generateQRDataFromContract(1n);
 * // Use qrData with QR code library to generate scannable code
 * console.log(`Scan this: ${qrData}`);
 * ```
 */
export async function generateQRDataFromContract(
  tokenId: bigint
): Promise<string> {
  return await readContract({
    contract: certificateManager,
    method: "function generateQRData(uint256 tokenId) view returns (string)",
    params: [tokenId],
  });
}

/**
 * Verify certificate validity
 *
 * Checks if certificate exists AND is valid (not revoked)
 *
 * @param tokenId - Certificate token ID
 * @returns Boolean indicating validity
 *
 * @example
 * ```typescript
 * const isValid = await verifyCertificate(1n);
 * console.log(isValid ? "Valid certificate" : "Invalid or revoked");
 * ```
 */
export async function verifyCertificate(tokenId: bigint): Promise<boolean> {
  return await readContract({
    contract: certificateManager,
    method: "function verifyCertificate(uint256 tokenId) view returns (bool)",
    params: [tokenId],
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get certificate price for a course
 *
 * Queries creator-set price or returns default based on operation type:
 * - First certificate mint: defaultCertificateFee (0.001 ETH) with 10% platform fee
 * - Course addition: defaultCourseAdditionFee (0.0001 ETH) with 2% platform fee
 *
 * @param courseId - Course ID
 * @param isFirstCertificate - True if minting first certificate, false if adding to existing
 * @returns Price in wei
 *
 * @example
 * ```typescript
 * const firstPrice = await getCertificatePrice(1n, true);  // 0.001 ETH for first mint
 * const addPrice = await getCertificatePrice(2n, false);   // 0.0001 ETH for addition
 * ```
 */
export async function getCertificatePrice(
  courseId: bigint,
  isFirstCertificate: boolean
): Promise<bigint> {
  // Query creator-set price or default
  const price = await readContract({
    contract: certificateManager,
    method:
      "function getCourseCertificatePrice(uint256 courseId) view returns (uint256)",
    params: [courseId],
  });

  // Log pricing context for debugging
  console.log(
    `[Certificate] Price for course ${courseId}: ${price} wei (${
      isFirstCertificate ? "first mint" : "addition"
    })`
  );

  return price;
}

/**
 * Calculate total price for adding multiple courses
 *
 * Each course addition uses the course addition fee structure (2% platform fee)
 * Queries individual course prices and sums them
 *
 * @param courseIds - Array of course IDs to add
 * @param hasExistingCertificate - True if user already has certificate
 * @returns Total price in wei with 5% buffer for gas fluctuations
 *
 * @example
 * ```typescript
 * const totalPrice = await calculateBatchPrice([1n, 2n, 3n], true);
 * console.log(`Total cost: ${ethers.formatEther(totalPrice)} ETH`);
 * ```
 */
export async function calculateBatchPrice(
  courseIds: bigint[],
  hasExistingCertificate: boolean
): Promise<bigint> {
  let total = BigInt(0);

  for (let i = 0; i < courseIds.length; i++) {
    const isFirst = i === 0 && !hasExistingCertificate;
    const price = await getCertificatePrice(courseIds[i], isFirst);
    total += price;
  }

  // Add 5% buffer for gas price fluctuations
  const buffer = (total * BigInt(5)) / BigInt(100);
  return total + buffer;
}

/**
 * Generate unique payment hash for replay attack prevention
 *
 * Creates keccak256 hash from: address + courseId + timestamp + nonce
 * Contract validates that hash hasn't been used before (usedPaymentHashes mapping)
 *
 * @param userAddress - User's wallet address
 * @param courseId - Course ID (use 0n for updateCertificate operations)
 * @param timestamp - Current timestamp (Date.now())
 * @param nonce - Random unique identifier (crypto.randomUUID())
 * @returns Payment hash as hex string (bytes32)
 *
 * @example
 * ```typescript
 * const paymentHash = generatePaymentHash(
 *   "0x123...",
 *   1n,
 *   Date.now(),
 *   crypto.randomUUID()
 * );
 * console.log(`Payment hash: ${paymentHash}`);
 * ```
 */
export function generatePaymentHash(
  userAddress: string,
  courseId: bigint,
  timestamp: number,
  nonce: string
): string {
  // Generate nonce hash (equivalent to ethers.id which is keccak256 of string)
  const nonceHash = keccak256(stringToHex(nonce));

  // Pack data using thirdweb's encodePacked
  const packed = encodePacked(
    ["address", "uint256", "uint256", "bytes32"],
    [userAddress as `0x${string}`, courseId, BigInt(timestamp), nonceHash]
  );

  // Hash with keccak256
  return keccak256(packed);
}

/**
 * Check if user is eligible to purchase/add certificate for a course
 *
 * Validates:
 * 1. Course completion (progressTracker.isCourseCompleted)
 * 2. License ownership (courseLicense.getLicense) - can be expired
 * 3. Not already in certificate (certificateCourseExists)
 *
 * @param userAddress - User's wallet address
 * @param courseId - Course ID to check
 * @returns Eligibility result with reason if not eligible
 *
 * @example
 * ```typescript
 * const eligibility = await checkEligibilityForCertificate("0x123...", 1n);
 * if (!eligibility.eligible) {
 *   console.error(`Cannot purchase: ${eligibility.reason}`);
 * } else {
 *   console.log(`First certificate: ${eligibility.isFirstCertificate}`);
 * }
 * ```
 */
export async function checkEligibilityForCertificate(
  userAddress: string,
  courseId: bigint
): Promise<CertificateEligibility> {
  try {
    // Check 1: Course completion
    const isCompleted = await readContract({
      contract: progressTracker,
      method:
        "function isCourseCompleted(address student, uint256 courseId) view returns (bool)",
      params: [userAddress, courseId],
    });

    if (!isCompleted) {
      return {
        eligible: false,
        isFirstCertificate: false,
        reason: "Course not completed",
      };
    }

    // Check 2: License ownership (getLicense returns struct with 5 fields)
    const license = await readContract({
      contract: courseLicense,
      method:
        "function getLicense(address student, uint256 courseId) view returns ((uint256 courseId, address student, uint256 durationLicense, uint256 expiryTimestamp, bool isActive))",
      params: [userAddress, courseId],
    });

    // License must have been owned (courseId > 0), active status doesn't matter
    if (license.courseId === BigInt(0)) {
      return {
        eligible: false,
        isFirstCertificate: false,
        reason: "No license found for this course",
      };
    }

    // Check 3: Already in certificate?
    const tokenId = await getUserCertificateId(userAddress);
    const isFirstCertificate = tokenId === BigInt(0);

    if (tokenId > BigInt(0)) {
      const alreadyExists = await isCourseInCertificate(tokenId, courseId);
      if (alreadyExists) {
        return {
          eligible: false,
          isFirstCertificate: false,
          reason: "Course already in certificate",
        };
      }
    }

    // All checks passed
    return {
      eligible: true,
      isFirstCertificate,
    };
  } catch (error) {
    return {
      eligible: false,
      isFirstCertificate: false,
      reason: `Error checking eligibility: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Calculate detailed price breakdown for certificate purchase/addition
 *
 * @param courseId - Course ID
 * @param isFirstCertificate - True if minting first certificate
 * @returns Detailed price breakdown including fees
 *
 * @example
 * ```typescript
 * const priceInfo = await calculateCertificatePrice(1n, true);
 * console.log(`Base price: ${ethers.formatEther(priceInfo.basePrice)} ETH`);
 * console.log(`Platform fee (${priceInfo.platformFeePercentage}%): ${ethers.formatEther(priceInfo.platformFee)} ETH`);
 * console.log(`Creator revenue: ${ethers.formatEther(priceInfo.creatorFee)} ETH`);
 * console.log(`Total: ${priceInfo.priceInEth} ETH`);
 * ```
 */
export async function calculateCertificatePrice(
  courseId: bigint,
  isFirstCertificate: boolean
): Promise<CertificatePrice> {
  const basePrice = await getCertificatePrice(courseId, isFirstCertificate);

  // Fee percentages based on operation type
  const platformFeePercentage = isFirstCertificate ? 10 : 2;
  const platformFee =
    (basePrice * BigInt(platformFeePercentage * 100)) / BigInt(10000);
  const creatorFee = basePrice - platformFee;

  return {
    basePrice,
    platformFeePercentage,
    platformFee,
    creatorFee,
    totalRequired: basePrice,
    priceInEth: toEther(basePrice),
  };
}
