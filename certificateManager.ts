import {
  BigInt,
  BigDecimal,
  Bytes,
  log,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  BaseRouteUpdated,
  CertificateMinted,
  CertificatePaymentRecorded,
  CertificateRevoked,
  CertificateUpdated,
  CourseAddedToCertificate,
  CourseAdditionFeeUpdated,
  CourseCertificatePriceSet,
  DefaultBaseRouteUpdated,
  DefaultMetadataBaseURIUpdated,
  DefaultCertificateFeeUpdated,
  PlatformNameUpdated,
  PlatformWalletUpdated,
  TokenURIUpdated,
  Paused,
  Unpaused,
  CertificateManager,
} from "../../generated/CertificateManager/CertificateManager";
import {
  AdminConfigEvent,
  Certificate,
  CertificateCourse,
  ContractConfigState,
  Course,
  CourseAddedToCertificateEvent,
  Enrollment,
  PlatformStats,
  StudentCourseEnrollment,
  UserProfile,
} from "../../generated/schema";

import {
  updateNetworkStats,
  incrementPlatformCounter,
  addPlatformRevenue,
} from "./helpers/networkStatsHelper";
import { createActivityEvent } from "./helpers/activityEventHelper";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BIGINT = BigInt.fromI32(0);
const ZERO_BIGDECIMAL = BigDecimal.fromString("0");
const ONE_BIGINT = BigInt.fromI32(1);
const WEI_TO_ETH = BigDecimal.fromString("1000000000000000000");
const CERTIFICATE_MANAGER_NAME = "CertificateManager";

function weiToEth(wei: BigInt): BigDecimal {
  return wei.toBigDecimal().div(WEI_TO_ETH);
}

function getOrCreateContractConfig(
  contractAddress: Bytes,
): ContractConfigState {
  let id = contractAddress.toHexString().toLowerCase();
  let config = ContractConfigState.load(id);

  if (config == null) {
    config = new ContractConfigState(id);
    config.contractAddress = contractAddress;
    config.contractType = CERTIFICATE_MANAGER_NAME;
    config.contractName = CERTIFICATE_MANAGER_NAME;
    config.defaultCertificateFee = ZERO_BIGINT;
    config.defaultCertificateFeeEth = ZERO_BIGDECIMAL;
    config.defaultCourseAdditionFee = ZERO_BIGINT;
    config.defaultCourseAdditionFeeEth = ZERO_BIGDECIMAL;
    config.platformWallet = Bytes.fromHexString(ZERO_ADDRESS);
    config.defaultPlatformName = "";
    config.defaultBaseRoute = "";
    config.defaultMetadataBaseURI = "";
    config.platformFeePercentage = ZERO_BIGINT;
    config.licenseURI = "";
    config.licenseBaseURI = "";
    config.isPaused = false;
    config.lastUpdated = ZERO_BIGINT;
    config.lastUpdateBlock = ZERO_BIGINT;
    config.lastUpdateTxHash = Bytes.fromHexString(ZERO_ADDRESS);
  }

  return config;
}

function createAdminConfigEvent(
  eventId: string,
  admin: Bytes,
  eventType: string,
  configKey: string,
  oldValue: string | null,
  newValue: string,
  contractName: string,
  description: string,
  timestamp: BigInt,
  blockNumber: BigInt,
  txHash: Bytes,
): void {
  let adminEvent = new AdminConfigEvent(eventId);
  adminEvent.admin = admin;
  adminEvent.type = eventType;
  adminEvent.configKey = configKey;
  adminEvent.oldValue = oldValue;
  adminEvent.newValue = newValue;
  adminEvent.affectedContract = contractName;
  adminEvent.timestamp = timestamp;
  adminEvent.blockNumber = blockNumber;
  adminEvent.transactionHash = txHash;
  adminEvent.description = description;
  adminEvent.save();
}

function getOrCreateUserProfile(
  address: Bytes,
  event: ethereum.Event,
): UserProfile {
  let id = address.toHexString().toLowerCase();
  let profile = UserProfile.load(id);
  let isNewUser = profile == null;

  if (isNewUser) {
    profile = new UserProfile(id);
    profile.address = address;

    profile.coursesEnrolled = ZERO_BIGINT;
    profile.coursesCompleted = ZERO_BIGINT;
    profile.activeEnrollments = ZERO_BIGINT;
    profile.totalSpentOnCourses = ZERO_BIGINT;
    profile.totalSpentOnCoursesEth = ZERO_BIGDECIMAL;
    profile.totalSpentOnCertificates = ZERO_BIGINT;
    profile.totalSpentOnCertificatesEth = ZERO_BIGDECIMAL;
    profile.totalSpent = ZERO_BIGINT;
    profile.totalSpentEth = ZERO_BIGDECIMAL;

    profile.coursesCreated = ZERO_BIGINT;
    profile.activeCoursesCreated = ZERO_BIGINT;
    profile.deletedCoursesCreated = ZERO_BIGINT;
    profile.totalStudents = ZERO_BIGINT;
    profile.totalRevenue = ZERO_BIGINT;
    profile.totalRevenueEth = ZERO_BIGDECIMAL;
    profile.averageRating = ZERO_BIGDECIMAL;
    profile.totalRatingsReceived = ZERO_BIGINT;

    profile.hasCertificate = false;
    profile.certificateTokenId = ZERO_BIGINT;
    profile.certificateName = "";
    profile.totalCoursesInCertificate = ZERO_BIGINT;
    profile.certificateMintedAt = ZERO_BIGINT;
    profile.certificateLastUpdated = ZERO_BIGINT;

    profile.totalSectionsCompleted = ZERO_BIGINT;
    profile.lastActivityAt = event.block.timestamp;
    profile.firstEnrollmentAt = ZERO_BIGINT;
    profile.firstCourseCreatedAt = ZERO_BIGINT;

    profile.enrollmentsThisMonth = ZERO_BIGINT;
    profile.completionsThisMonth = ZERO_BIGINT;
    profile.revenueThisMonth = ZERO_BIGINT;
    profile.revenueThisMonthEth = ZERO_BIGDECIMAL;

    profile.isBlacklisted = false;
    profile.blacklistedAt = ZERO_BIGINT;
    profile.blacklistedBy = Bytes.fromHexString(ZERO_ADDRESS);

    profile.createdAt = event.block.timestamp;
    profile.updatedAt = event.block.timestamp;
    profile.firstTxHash = event.transaction.hash;
    profile.lastTxHash = event.transaction.hash;
    profile.blockNumber = event.block.number;

    incrementPlatformCounter("USER", event);
  }

  return profile as UserProfile;
}

export function handleCertificateMinted(event: CertificateMinted): void {
  let tokenId = event.params.tokenId;
  let certificateId = tokenId.toString();
  let certificate = new Certificate(certificateId);

  let contractAddress = event.address;
  let certificateManagerContract = CertificateManager.bind(contractAddress);

  let getCertResult = certificateManagerContract.try_getCertificate(tokenId);
  if (!getCertResult.reverted) {
    let certData = getCertResult.value;
    certificate.tokenId = tokenId;
    certificate.recipientAddress = event.params.owner;
    certificate.recipientName = event.params.recipientName;
    certificate.platformName = certData.platformName;
    certificate.ipfsCID = certData.ipfsCID;
    certificate.paymentReceiptHash = event.params.paymentReceiptHash;
    certificate.baseRoute = certData.baseRoute;
    certificate.isValid = certData.isValid;
    certificate.totalCourses = BigInt.fromI32(certData.completedCourses.length);
    certificate.totalRevenue = event.params.pricePaid;
    certificate.totalRevenueEth = weiToEth(event.params.pricePaid);
    certificate.createdAt = event.block.timestamp;
    certificate.lastUpdated = event.block.timestamp;
    certificate.mintTxHash = event.transaction.hash;
    certificate.blockNumber = event.block.number;
  } else {
    log.warning("Failed to get certificate data for tokenId {}", [
      tokenId.toString(),
    ]);
    certificate.tokenId = tokenId;
    certificate.recipientAddress = event.params.owner;
    certificate.recipientName = event.params.recipientName;
    certificate.platformName = "";
    certificate.ipfsCID = "";
    certificate.paymentReceiptHash = event.params.paymentReceiptHash;
    certificate.baseRoute = "";
    certificate.isValid = true;
    certificate.totalCourses = ZERO_BIGINT;
    certificate.totalRevenue = event.params.pricePaid;
    certificate.totalRevenueEth = weiToEth(event.params.pricePaid);
    certificate.createdAt = event.block.timestamp;
    certificate.lastUpdated = event.block.timestamp;
    certificate.mintTxHash = event.transaction.hash;
    certificate.blockNumber = event.block.number;
  }

  let profile = getOrCreateUserProfile(event.params.owner, event);
  certificate.owner = profile.id;
  certificate.save();

  if (!getCertResult.reverted) {
    let certData = getCertResult.value;
    for (let i = 0; i < certData.completedCourses.length; i++) {
      let courseId = certData.completedCourses[i];
      let courseIdStr = courseId.toString();

      let scEnrollmentId =
        event.params.owner.toHexString().toLowerCase() + "-" + courseIdStr;
      let scEnrollment = StudentCourseEnrollment.load(scEnrollmentId);

      if (!scEnrollment) {
        log.warning(
          "StudentCourseEnrollment not found for minted certificate: {}",
          [scEnrollmentId],
        );
        continue;
      }

      let enrollmentId = scEnrollment.enrollment;
      let enrollment = Enrollment.load(enrollmentId);

      if (!enrollment) {
        log.warning("Enrollment not found for minted certificate course: {}", [
          enrollmentId,
        ]);
        continue;
      }

      enrollment.hasCertificate = true;
      enrollment.certificateTokenId = tokenId;
      enrollment.certificateAddedAt = event.block.timestamp;
      enrollment.certificatePrice = event.params.pricePaid;
      enrollment.lastTxHash = event.transaction.hash;
      enrollment.save();

      let course = Course.load(courseIdStr);
      if (!course) {
        log.warning("Course not found for minted certificate: {}", [
          courseIdStr,
        ]);
        continue;
      }

      let certCourseId = certificateId + "-" + courseIdStr;
      let certCourse = new CertificateCourse(certCourseId);
      certCourse.certificate = certificateId;
      certCourse.course = courseIdStr;
      certCourse.enrollment = enrollmentId;
      certCourse.addedAt = event.block.timestamp;
      certCourse.pricePaid = event.params.pricePaid;
      certCourse.pricePaidEth = weiToEth(event.params.pricePaid);
      certCourse.isFirstCourse = i == 0;
      certCourse.txHash = event.transaction.hash;
      certCourse.blockNumber = event.block.number;
      certCourse.save();

      log.info(
        "Created CertificateCourse for minted certificate - tokenId: {}, courseId: {}",
        [tokenId.toString(), courseIdStr],
      );
    }
  }

  profile.hasCertificate = true;
  profile.certificateTokenId = tokenId;
  profile.certificateName = event.params.recipientName;
  profile.certificateMintedAt = event.block.timestamp;
  profile.certificateLastUpdated = event.block.timestamp;
  profile.certificate = certificateId;
  profile.lastActivityAt = event.block.timestamp;
  profile.lastTxHash = event.transaction.hash;
  profile.updatedAt = event.block.timestamp;
  profile.save();

  let mintPrice = event.params.pricePaid;
  profile.totalSpentOnCertificates =
    profile.totalSpentOnCertificates.plus(mintPrice);
  profile.totalSpentOnCertificatesEth =
    profile.totalSpentOnCertificatesEth.plus(weiToEth(mintPrice));
  profile.totalSpent = profile.totalSpent.plus(mintPrice);
  profile.totalSpentEth = profile.totalSpentEth.plus(weiToEth(mintPrice));
  profile.save();

  createActivityEvent(
    event,
    "CERTIFICATE_MINTED",
    event.params.owner,
    "Minted certificate: " + event.params.recipientName,
    null,
    null,
    certificateId,
    null,
  );

  incrementPlatformCounter("CERTIFICATE", event);
  updateNetworkStats(event, "CERTIFICATE_MINTED");

  let platformFeePercent = BigDecimal.fromString("10");
  let platformFee = mintPrice
    .toBigDecimal()
    .times(platformFeePercent)
    .div(BigDecimal.fromString("100"));
  let creatorRevenue = mintPrice.toBigDecimal().minus(platformFee);

  addPlatformRevenue(
    mintPrice,
    weiToEth(mintPrice),
    BigInt.fromString(platformFee.truncate(0).toString()),
    platformFee.div(WEI_TO_ETH),
    BigInt.fromString(creatorRevenue.truncate(0).toString()),
    creatorRevenue.div(WEI_TO_ETH),
    event,
  );

  log.info("Certificate minted - tokenId: {}, recipient: {}", [
    tokenId.toString(),
    event.params.owner.toHexString(),
  ]);
}

export function handleCourseAddedToCertificate(
  event: CourseAddedToCertificate,
): void {
  let tokenId = event.params.tokenId;
  let courseId = event.params.courseId;
  let certificateId = tokenId.toString();
  let owner = event.params.owner;

  let certificate = Certificate.load(certificateId);
  if (!certificate) {
    log.warning("Certificate not found for tokenId: {}", [tokenId.toString()]);
    return;
  }

  let contractAddress = event.address;
  let certificateManagerContract = CertificateManager.bind(contractAddress);
  let getCertResult = certificateManagerContract.try_getCertificate(tokenId);

  if (!getCertResult.reverted) {
    let certData = getCertResult.value;
    certificate.totalCourses =
      certData.completedCourses.length > 0
        ? BigInt.fromI32(certData.completedCourses.length)
        : ZERO_BIGINT;
    certificate.ipfsCID = certData.ipfsCID;
    certificate.lastUpdated = event.block.timestamp;
    certificate.save();
  }

  if (!getCertResult.reverted) {
    let certData = getCertResult.value;

    for (let i = 0; i < certData.completedCourses.length; i++) {
      let backfillCourseId = certData.completedCourses[i];
      let backfillCourseIdStr = backfillCourseId.toString();
      let backfillCertCourseId = certificateId + "-" + backfillCourseIdStr;

      let existingCertCourse = CertificateCourse.load(backfillCertCourseId);
      if (existingCertCourse != null) {
        continue;
      }

      let backfillScEnrollmentId =
        owner.toHexString().toLowerCase() + "-" + backfillCourseIdStr;
      let backfillScEnrollment = StudentCourseEnrollment.load(
        backfillScEnrollmentId,
      );

      if (!backfillScEnrollment) {
        log.warning(
          "Backfill: StudentCourseEnrollment not found for courseId: {}",
          [backfillCourseIdStr],
        );
        continue;
      }

      let backfillEnrollmentId = backfillScEnrollment.enrollment;
      let backfillEnrollment = Enrollment.load(backfillEnrollmentId);

      if (!backfillEnrollment) {
        log.warning("Backfill: Enrollment not found for courseId: {}", [
          backfillCourseIdStr,
        ]);
        continue;
      }

      let backfillCourse = Course.load(backfillCourseIdStr);
      if (!backfillCourse) {
        log.warning("Backfill: Course not found: {}", [backfillCourseIdStr]);
        continue;
      }

      backfillEnrollment.hasCertificate = true;
      backfillEnrollment.certificateTokenId = tokenId;
      backfillEnrollment.certificateAddedAt = event.block.timestamp;
      backfillEnrollment.lastTxHash = event.transaction.hash;
      backfillEnrollment.save();

      let backfillCertCourse = new CertificateCourse(backfillCertCourseId);
      backfillCertCourse.certificate = certificateId;
      backfillCertCourse.course = backfillCourseIdStr;
      backfillCertCourse.enrollment = backfillEnrollmentId;
      backfillCertCourse.addedAt = event.block.timestamp;
      backfillCertCourse.pricePaid = ZERO_BIGINT;
      backfillCertCourse.pricePaidEth = weiToEth(ZERO_BIGINT);
      backfillCertCourse.isFirstCourse = i == 0;
      backfillCertCourse.txHash = event.transaction.hash;
      backfillCertCourse.blockNumber = event.block.number;
      backfillCertCourse.save();

      log.info("Backfilled CertificateCourse - tokenId: {}, courseId: {}", [
        tokenId.toString(),
        backfillCourseIdStr,
      ]);
    }
  }

  let scEnrollmentId =
    owner.toHexString().toLowerCase() + "-" + courseId.toString();
  let scEnrollment = StudentCourseEnrollment.load(scEnrollmentId);

  if (!scEnrollment) {
    log.warning("StudentCourseEnrollment not found: {}", [scEnrollmentId]);
  }

  let enrollmentId = scEnrollment ? scEnrollment.enrollment : "";
  let enrollment = Enrollment.load(enrollmentId);

  if (!enrollment) {
    log.warning("Enrollment not found for certificate course addition: {}", [
      enrollmentId,
    ]);
  } else {
    enrollment.hasCertificate = true;
    enrollment.certificateTokenId = tokenId;
    enrollment.certificateAddedAt = event.block.timestamp;
    enrollment.certificatePrice = event.params.pricePaid;
    enrollment.lastTxHash = event.transaction.hash;
    enrollment.save();
  }

  let course = Course.load(courseId.toString());
  if (!course) {
    log.warning("Course not found: {}", [courseId.toString()]);
  }

  if (!enrollment || !course) {
    log.error(
      "Cannot create CertificateCourse - missing enrollment or course. Certificate: {}, Course: {}, Enrollment: {}",
      [certificateId, courseId.toString(), enrollmentId],
    );
    return;
  }

  let certCourseId = certificateId + "-" + courseId.toString();
  let existingCertCourse = CertificateCourse.load(certCourseId);
  if (existingCertCourse == null) {
    let certCourse = new CertificateCourse(certCourseId);
    certCourse.certificate = certificateId;
    certCourse.course = courseId.toString();
    certCourse.enrollment = enrollmentId;
    certCourse.addedAt = event.block.timestamp;
    certCourse.pricePaid = event.params.pricePaid;
    certCourse.pricePaidEth = weiToEth(event.params.pricePaid);
    certCourse.isFirstCourse = certificate.totalCourses.equals(ONE_BIGINT);
    certCourse.txHash = event.transaction.hash;
    certCourse.blockNumber = event.block.number;
    certCourse.save();

    log.info(
      "Created CertificateCourse for new course - tokenId: {}, courseId: {}",
      [tokenId.toString(), courseId.toString()],
    );
  } else {
    log.info("CertificateCourse already exists - tokenId: {}, courseId: {}", [
      tokenId.toString(),
      courseId.toString(),
    ]);
  }

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let courseEvent = new CourseAddedToCertificateEvent(eventId);
  courseEvent.tokenId = tokenId;
  courseEvent.certificate = certificateId;
  courseEvent.courseId = courseId;
  courseEvent.course = courseId.toString();
  courseEvent.student = owner;
  courseEvent.userProfile = owner.toHexString().toLowerCase();
  courseEvent.pricePaid = event.params.pricePaid;
  courseEvent.pricePaidEth = weiToEth(event.params.pricePaid);
  courseEvent.blockTimestamp = event.block.timestamp;
  courseEvent.blockNumber = event.block.number;
  courseEvent.transactionHash = event.transaction.hash;
  courseEvent.save();

  let profile = getOrCreateUserProfile(owner, event);
  profile.totalCoursesInCertificate = certificate.totalCourses;
  profile.certificateLastUpdated = event.block.timestamp;

  let addPrice = event.params.pricePaid;
  profile.totalSpentOnCertificates =
    profile.totalSpentOnCertificates.plus(addPrice);
  profile.totalSpentOnCertificatesEth =
    profile.totalSpentOnCertificatesEth.plus(weiToEth(addPrice));
  profile.totalSpent = profile.totalSpent.plus(addPrice);
  profile.totalSpentEth = profile.totalSpentEth.plus(weiToEth(addPrice));
  profile.lastActivityAt = event.block.timestamp;
  profile.lastTxHash = event.transaction.hash;
  profile.updatedAt = event.block.timestamp;
  profile.save();

  certificate.totalRevenue = certificate.totalRevenue.plus(addPrice);
  certificate.totalRevenueEth = certificate.totalRevenueEth.plus(
    weiToEth(addPrice),
  );
  certificate.save();

  updateNetworkStats(event, "CERTIFICATE_UPDATE");

  if (course) {
    let creator = getOrCreateUserProfile(course.creator, event);

    let isFirstCourse = certificate.totalCourses.equals(ONE_BIGINT);
    let platformFeePercent = isFirstCourse
      ? BigDecimal.fromString("10")
      : BigDecimal.fromString("5");
    let platformFee = addPrice
      .toBigDecimal()
      .times(platformFeePercent)
      .div(BigDecimal.fromString("100"));
    let creatorRevenue = addPrice.toBigDecimal().minus(platformFee);

    addPlatformRevenue(
      addPrice,
      weiToEth(addPrice),
      BigInt.fromString(platformFee.truncate(0).toString()),
      platformFee.div(WEI_TO_ETH),
      BigInt.fromString(creatorRevenue.truncate(0).toString()),
      creatorRevenue.div(WEI_TO_ETH),
      event,
    );
  } else {
    let isFirstCourse = certificate.totalCourses.equals(ONE_BIGINT);
    let platformFeePercent = isFirstCourse
      ? BigDecimal.fromString("10")
      : BigDecimal.fromString("5");
    let platformFee = addPrice
      .toBigDecimal()
      .times(platformFeePercent)
      .div(BigDecimal.fromString("100"));
    let creatorRevenue = addPrice.toBigDecimal().minus(platformFee);

    addPlatformRevenue(
      addPrice,
      weiToEth(addPrice),
      BigInt.fromString(platformFee.truncate(0).toString()),
      platformFee.div(WEI_TO_ETH),
      BigInt.fromString(creatorRevenue.truncate(0).toString()),
      creatorRevenue.div(WEI_TO_ETH),
      event,
    );
  }

  let courseForActivity = course ? course.id : courseId.toString();
  let courseName = course ? course.title : "Unknown Course";

  createActivityEvent(
    event,
    "COURSE_ADDED_TO_CERTIFICATE",
    owner,
    "Added course '" + courseName + "' to certificate",
    courseForActivity,
    enrollmentId,
    certificateId,
    null,
  );

  log.info("Course added to certificate - tokenId: {}, courseId: {}", [
    tokenId.toString(),
    courseId.toString(),
  ]);
}

export function handleCertificateUpdated(event: CertificateUpdated): void {
  let certificateId = event.params.tokenId.toString();
  let certificate = Certificate.load(certificateId);

  if (certificate) {
    let contractAddress = event.address;
    let certificateManagerContract = CertificateManager.bind(contractAddress);
    let tokenId = event.params.tokenId;
    let getCertResult = certificateManagerContract.try_getCertificate(tokenId);

    if (!getCertResult.reverted) {
      let certData = getCertResult.value;
      certificate.ipfsCID = certData.ipfsCID;
      certificate.lastUpdated = event.block.timestamp;
      certificate.save();
    }

    let profile = getOrCreateUserProfile(certificate.recipientAddress, event);
    profile.certificateLastUpdated = event.block.timestamp;
    profile.lastActivityAt = event.block.timestamp;
    profile.lastTxHash = event.transaction.hash;
    profile.updatedAt = event.block.timestamp;
    profile.save();

    createActivityEvent(
      event,
      "CERTIFICATE_UPDATED",
      certificate.recipientAddress,
      "Updated certificate metadata",
      null,
      null,
      certificateId,
      null,
    );

    log.info("Certificate updated - tokenId: {}", [
      event.params.tokenId.toString(),
    ]);
  }
}

export function handleCertificateRevoked(event: CertificateRevoked): void {
  let certificateId = event.params.tokenId.toString();
  let certificate = Certificate.load(certificateId);

  if (certificate) {
    certificate.isValid = false;
    certificate.lastUpdated = event.block.timestamp;
    certificate.save();

    createActivityEvent(
      event,
      "CERTIFICATE_REVOKED",
      certificate.recipientAddress,
      "Certificate revoked: " + event.params.reason,
      null,
      null,
      certificateId,
      event.params.reason,
    );

    log.info("Certificate revoked - tokenId: {}, reason: {}", [
      event.params.tokenId.toString(),
      event.params.reason,
    ]);
  }
}

export function handleCertificatePaymentRecorded(
  event: CertificatePaymentRecorded,
): void {
  let certificateId = event.params.tokenId.toString();
  let certificate = Certificate.load(certificateId);

  if (certificate) {
    certificate.paymentReceiptHash = event.params.paymentReceiptHash;
    certificate.lastUpdated = event.block.timestamp;
    certificate.save();

    log.info("Certificate payment recorded - tokenId: {}", [
      event.params.tokenId.toString(),
    ]);
  }
}

export function handleBaseRouteUpdated(event: BaseRouteUpdated): void {
  let certificateId = event.params.tokenId.toString();
  let certificate = Certificate.load(certificateId);

  if (certificate) {
    certificate.baseRoute = event.params.newBaseRoute;
    certificate.lastUpdated = event.block.timestamp;
    certificate.save();

    log.info("Certificate base route updated - tokenId: {}, route: {}", [
      event.params.tokenId.toString(),
      event.params.newBaseRoute,
    ]);
  }
}

export function handleDefaultBaseRouteUpdated(
  event: DefaultBaseRouteUpdated,
): void {
  let config = getOrCreateContractConfig(event.address);
  let oldRoute = config.defaultBaseRoute;

  config.defaultBaseRoute = event.params.newBaseRoute;
  config.lastUpdated = event.block.timestamp;
  config.lastUpdateBlock = event.block.number;
  config.lastUpdateTxHash = event.transaction.hash;
  config.save();

  let description =
    "Updated default base route to: " + event.params.newBaseRoute;

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  createAdminConfigEvent(
    eventId,
    event.transaction.from,
    "ROUTE_UPDATE",
    "defaultBaseRoute",
    oldRoute,
    event.params.newBaseRoute,
    CERTIFICATE_MANAGER_NAME,
    description,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash,
  );

  log.info("Default base route updated: {}", [event.params.newBaseRoute]);
}

export function handleDefaultMetadataBaseURIUpdated(
  event: DefaultMetadataBaseURIUpdated,
): void {
  let config = getOrCreateContractConfig(event.address);
  let oldURI = config.defaultMetadataBaseURI;

  config.defaultMetadataBaseURI = event.params.newBaseURI;
  config.lastUpdated = event.block.timestamp;
  config.lastUpdateBlock = event.block.number;
  config.lastUpdateTxHash = event.transaction.hash;
  config.save();

  let description = "Updated metadata base URI to: " + event.params.newBaseURI;

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  createAdminConfigEvent(
    eventId,
    event.transaction.from,
    "METADATA_URI_UPDATE",
    "defaultMetadataBaseURI",
    oldURI,
    event.params.newBaseURI,
    CERTIFICATE_MANAGER_NAME,
    description,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash,
  );

  log.info("Metadata base URI updated: {}", [event.params.newBaseURI]);
}

export function handlePlatformNameUpdated(event: PlatformNameUpdated): void {
  let config = getOrCreateContractConfig(event.address);
  let oldNameValue: string = "";
  if (config.defaultPlatformName) {
    oldNameValue = config.defaultPlatformName as string;
  }

  config.defaultPlatformName = event.params.newPlatformName;
  config.lastUpdated = event.block.timestamp;
  config.lastUpdateBlock = event.block.number;
  config.lastUpdateTxHash = event.transaction.hash;
  config.save();

  let description =
    "Updated platform name from '" +
    oldNameValue +
    "' to '" +
    event.params.newPlatformName +
    "'";

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  createAdminConfigEvent(
    eventId,
    event.transaction.from,
    "NAME_UPDATE",
    "platformName",
    oldNameValue,
    event.params.newPlatformName,
    CERTIFICATE_MANAGER_NAME,
    description,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash,
  );

  log.info("Platform name updated: {}", [event.params.newPlatformName]);
}

export function handleCourseAdditionFeeUpdated(
  event: CourseAdditionFeeUpdated,
): void {
  let config = getOrCreateContractConfig(event.address);
  let oldFeeValue = ZERO_BIGINT;
  let oldFeeEthValue = ZERO_BIGDECIMAL;

  if (config.defaultCourseAdditionFee) {
    oldFeeValue = config.defaultCourseAdditionFee as BigInt;
  }
  if (config.defaultCourseAdditionFeeEth) {
    oldFeeEthValue = config.defaultCourseAdditionFeeEth as BigDecimal;
  }

  config.defaultCourseAdditionFee = event.params.newFee;
  config.defaultCourseAdditionFeeEth = weiToEth(event.params.newFee);
  config.lastUpdated = event.block.timestamp;
  config.lastUpdateBlock = event.block.number;
  config.lastUpdateTxHash = event.transaction.hash;
  config.save();

  let newFeeEth = weiToEth(event.params.newFee);
  let oldValueStr =
    oldFeeValue.toString() + " wei (" + oldFeeEthValue.toString() + " ETH)";
  let newValueStr =
    event.params.newFee.toString() + " wei (" + newFeeEth.toString() + " ETH)";
  let description =
    "Updated course addition fee from " +
    oldFeeEthValue.toString() +
    " ETH to " +
    newFeeEth.toString() +
    " ETH";

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  createAdminConfigEvent(
    eventId,
    event.transaction.from,
    "FEE_UPDATE",
    "courseAdditionFee",
    oldValueStr,
    newValueStr,
    CERTIFICATE_MANAGER_NAME,
    description,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash,
  );

  log.info("Course addition fee updated: {} wei", [
    event.params.newFee.toString(),
  ]);
}

export function handleCourseCertificatePriceSet(
  event: CourseCertificatePriceSet,
): void {
  let courseId = event.params.courseId;
  let course = Course.load(courseId.toString());

  if (course) {
    course.certificatePrice = event.params.price;
    course.certificatePriceEth = weiToEth(event.params.price);
    course.updatedAt = event.block.timestamp;
    course.save();

    log.info("Course certificate price set - courseId: {}, price: {} wei", [
      courseId.toString(),
      event.params.price.toString(),
    ]);
  }
}

export function handleTokenURIUpdated(event: TokenURIUpdated): void {
  let certificateId = event.params.tokenId.toString();
  let certificate = Certificate.load(certificateId);

  if (certificate) {
    certificate.customTokenURI = event.params.newURI;
    certificate.lastUpdated = event.block.timestamp;
    certificate.save();

    let profile = UserProfile.load(
      certificate.recipientAddress.toHexString().toLowerCase(),
    );
    if (profile) {
      profile.lastActivityAt = event.block.timestamp;
      profile.updatedAt = event.block.timestamp;
      profile.lastTxHash = event.transaction.hash;
      profile.save();
    }

    log.info("Token URI updated for certificate {}: {}", [
      certificateId,
      event.params.newURI,
    ]);
  }
}

export function handleDefaultCertificateFeeUpdated(
  event: DefaultCertificateFeeUpdated,
): void {
  let config = getOrCreateContractConfig(event.address);
  let oldFeeValue = ZERO_BIGINT;
  let oldFeeEthValue = ZERO_BIGDECIMAL;

  if (config.defaultCertificateFee) {
    oldFeeValue = config.defaultCertificateFee as BigInt;
  }
  if (config.defaultCertificateFeeEth) {
    oldFeeEthValue = config.defaultCertificateFeeEth as BigDecimal;
  }

  config.defaultCertificateFee = event.params.newFee;
  config.defaultCertificateFeeEth = weiToEth(event.params.newFee);
  config.lastUpdated = event.block.timestamp;
  config.lastUpdateBlock = event.block.number;
  config.lastUpdateTxHash = event.transaction.hash;
  config.save();

  let newFeeEth = weiToEth(event.params.newFee);
  let oldValueStr =
    oldFeeValue.toString() + " wei (" + oldFeeEthValue.toString() + " ETH)";
  let newValueStr =
    event.params.newFee.toString() + " wei (" + newFeeEth.toString() + " ETH)";
  let description =
    "Updated default certificate fee from " +
    oldFeeEthValue.toString() +
    " ETH to " +
    newFeeEth.toString() +
    " ETH";

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  createAdminConfigEvent(
    eventId,
    event.transaction.from,
    "FEE_UPDATE",
    "defaultCertificateFee",
    oldValueStr,
    newValueStr,
    CERTIFICATE_MANAGER_NAME,
    description,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash,
  );

  updateNetworkStats(event, "CONFIG_UPDATE");

  log.info("Default certificate fee updated: {} wei", [
    event.params.newFee.toString(),
  ]);
}

export function handlePlatformWalletUpdatedCertMgr(
  event: PlatformWalletUpdated,
): void {
  let config = getOrCreateContractConfig(event.address);
  let oldWalletValue = ZERO_ADDRESS;
  if (config.platformWallet) {
    oldWalletValue = (config.platformWallet as Bytes).toHexString();
  }

  config.platformWallet = event.params.newWallet;
  config.lastUpdated = event.block.timestamp;
  config.lastUpdateBlock = event.block.number;
  config.lastUpdateTxHash = event.transaction.hash;
  config.save();

  let description =
    "Updated platform wallet from " +
    oldWalletValue +
    " to " +
    event.params.newWallet.toHexString();

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  createAdminConfigEvent(
    eventId,
    event.transaction.from,
    "WALLET_UPDATE",
    "platformWallet",
    oldWalletValue,
    event.params.newWallet.toHexString(),
    CERTIFICATE_MANAGER_NAME,
    description,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash,
  );

  updateNetworkStats(event, "CONFIG_UPDATE");

  log.info("Platform wallet updated to: {}", [
    event.params.newWallet.toHexString(),
  ]);
}

export function handleCertificateManagerPaused(event: Paused): void {
  let config = getOrCreateContractConfig(event.address);

  config.isPaused = true;
  config.lastUpdated = event.block.timestamp;
  config.lastUpdateBlock = event.block.number;
  config.lastUpdateTxHash = event.transaction.hash;
  config.save();

  let description = "CertificateManager contract paused by admin";

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  createAdminConfigEvent(
    eventId,
    event.params.account,
    "PAUSE",
    "contractStatus",
    "active",
    "paused",
    CERTIFICATE_MANAGER_NAME,
    description,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash,
  );

  updateNetworkStats(event, "CONTRACT_PAUSED");

  log.warning("CertificateManager paused by: {}", [
    event.params.account.toHexString(),
  ]);
}

export function handleCertificateManagerUnpaused(event: Unpaused): void {
  let config = getOrCreateContractConfig(event.address);

  config.isPaused = false;
  config.lastUpdated = event.block.timestamp;
  config.lastUpdateBlock = event.block.number;
  config.lastUpdateTxHash = event.transaction.hash;
  config.save();

  let description = "CertificateManager contract unpaused by admin";

  let eventId =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  createAdminConfigEvent(
    eventId,
    event.params.account,
    "UNPAUSE",
    "contractStatus",
    "paused",
    "active",
    CERTIFICATE_MANAGER_NAME,
    description,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash,
  );

  updateNetworkStats(event, "CONTRACT_UNPAUSED");

  log.info("CertificateManager unpaused by: {}", [
    event.params.account.toHexString(),
  ]);
}
