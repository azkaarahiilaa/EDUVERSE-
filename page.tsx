"use client";

import { useEffect, useState, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { useSearchParams } from "next/navigation";
import {
  Award,
  BookOpen,
  Trophy,
  Calendar,
  Clock,
  ChevronRight,
  Loader2,
  AlertCircle,
  ExternalLink,
  QrCode,
  Download,
  Share2,
  CheckCircle,
} from "lucide-react";
import { PageContainer } from "@/components/PageContainer";
import { ThumbnailImage } from "@/components/ThumbnailImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getUserCertificates,
  getCertificateByTokenId,
} from "@/services/goldsky-mylearning.service";
import type { CertificateData } from "@/services/goldsky-mylearning.service";
import Image from "next/image";

interface CourseInCertificate {
  courseId: string;
  title: string;
  description: string;
  thumbnailCID: string;
  category: number;
  difficulty: number;
  completedAt: Date;
  addedToCertificateAt: Date;
  pricePaid: number;
  pricePaidEth: number;
  isFirstCourse: boolean;
  isCompleted: boolean;
  completionPercentage: number;
  creator: {
    name: string;
    address: string;
  };
}

interface Certificate {
  id: string;
  tokenId: string;
  studentName: string;
  studentAddress: string;
  platformName: string;
  baseRoute: string;
  isValid: boolean;
  mintedAt: Date;
  lastUpdated: Date;
  totalCoursesCompleted: number;
  totalRevenue: number;
  totalRevenueEth: number;
  verificationUrl: string;
  qrCodeUrl: string;
  courses: CourseInCertificate[];
}

const formatMantaPrice = (eth: number): string => {
  return `${eth.toFixed(6)} MANTA`;
};

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

const formatShortDate = (date: Date): string => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

function transformCertificateData(certData: CertificateData): Certificate {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verificationUrl = `${baseUrl}/verify-certificate?tokenId=${certData.tokenId}`;

  return {
    id: certData.id,
    tokenId: certData.tokenId.toString(),
    studentName: certData.recipientName,
    studentAddress: certData.id,
    platformName: certData.platformName,
    baseRoute: certData.baseRoute,
    isValid: true,
    mintedAt: certData.mintedAt,
    lastUpdated: certData.lastUpdatedAt,
    totalCoursesCompleted: certData.totalCourses,
    totalRevenue: certData.totalPaid,
    totalRevenueEth: certData.totalPaidEth,
    verificationUrl,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      verificationUrl
    )}`,
    courses: certData.courses.map((course, index) => ({
      courseId: course.courseId,
      title: course.title,
      description: "",
      thumbnailCID: course.thumbnailCID,
      category: 0,
      difficulty: 0,
      completedAt: course.addedAt,
      addedToCertificateAt: course.addedAt,
      pricePaid: 0,
      pricePaidEth: 0,
      isFirstCourse: index === 0,
      isCompleted: course.isCompleted,
      completionPercentage: course.completionPercentage,
      creator: {
        name: "Instructor",
        address: "0x0000000000000000000000000000000000000000",
      },
    })),
  };
}

interface CertificateCardProps {
  certificate: Certificate;
  onCourseClick: (course: CourseInCertificate) => void;
  onShareClick: () => void;
  onQRCodeClick: () => void;
}

const CertificateCard = ({
  certificate,
  onCourseClick,
  onShareClick,
  onQRCodeClick,
}: CertificateCardProps) => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-primary/5 via-background to-secondary/20 border-2 border-primary/20 rounded-xl p-8 shadow-lg">
        <div className="flex items-start justify-between mb-8">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <div className="p-3 bg-primary rounded-xl shadow-md">
                <Award className="w-8 h-8 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-foreground">
                  {certificate.studentName}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {certificate.platformName} • Lifetime Certificate
                </p>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-base">
              This blockchain-verified certificate represents your complete
              learning journey. Each completed course is permanently recorded
              on-chain and automatically added to your evolving credential.
            </p>
          </div>
          <div className="flex gap-2 ml-4">
            <Button
              variant="outline"
              size="icon"
              onClick={onQRCodeClick}
              className="h-10 w-10"
              title="View QR Code"
            >
              <QrCode className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onShareClick}
              className="h-10 w-10"
              title="Share Certificate"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-5 bg-card/80 backdrop-blur-sm rounded-xl border border-border shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Courses Completed
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {certificate.totalCoursesCompleted}
            </p>
          </div>

          <div className="p-5 bg-card/80 backdrop-blur-sm rounded-xl border border-border shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Issued Date
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {formatShortDate(certificate.mintedAt)}
            </p>
          </div>

          <div className="p-5 bg-card/80 backdrop-blur-sm rounded-xl border border-border shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-green-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Last Updated
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {formatShortDate(certificate.lastUpdated)}
            </p>
          </div>

          <div className="p-5 bg-card/80 backdrop-blur-sm rounded-xl border border-border shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-purple-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Total Investment
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {formatMantaPrice(certificate.totalRevenueEth)}
            </p>
          </div>
        </div>

        <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">
              Token ID: #{certificate.tokenId}
            </span>
            <span>•</span>
            <span className="text-xs">
              Address: {certificate.studentAddress.slice(0, 6)}...
              {certificate.studentAddress.slice(-4)}
            </span>
            <span>•</span>
            <Badge
              variant="outline"
              className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
            >
              Blockchain Verified
            </Badge>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Completed Courses
          </h3>
          <span className="text-sm text-muted-foreground">
            {certificate.courses.length} course
            {certificate.courses.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-3">
          {certificate.courses.map((course, index) => (
            <button
              key={course.courseId}
              onClick={() => onCourseClick(course)}
              className="w-full p-4 bg-secondary/50 hover:bg-secondary hover:shadow-md rounded-lg transition-all text-left group border border-transparent hover:border-primary/20"
            >
              <div className="flex items-center gap-4">
                <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-muted shadow-sm">
                  <ThumbnailImage
                    cid={course.thumbnailCID}
                    alt={course.title}
                    fallback={
                      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <BookOpen className="w-10 h-10 text-white/70" />
                      </div>
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-muted-foreground px-2 py-1 bg-primary/10 rounded">
                          #{index + 1}
                        </span>
                        {course.isFirstCourse && (
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 text-xs">
                            🏆 First Course
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1 text-lg mb-2">
                        {course.title}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Added {formatShortDate(course.addedToCertificateAt)}
                        </span>
                        {course.isCompleted && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <Trophy className="w-3 h-3" />
                              {course.completionPercentage}% Complete
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const NoCertificateState = () => {
  return (
    <div className="bg-card border-2 border-dashed border-border rounded-xl p-16 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-20 h-20 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
          <Award className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-2xl font-semibold mb-3 text-foreground">
          No Certificate Yet
        </h3>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          Complete your first course and mint your lifetime blockchain
          certificate to showcase your learning achievements. Your certificate
          grows automatically with each course you complete.
        </p>
        <div className="bg-secondary/50 rounded-lg p-4 text-left space-y-2">
          <p className="text-sm font-medium text-foreground">How it works:</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">1.</span>
              <span>Enroll in a course and complete all sections</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">2.</span>
              <span>
                Mint your certificate (10% platform fee for first course)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">3.</span>
              <span>
                Each additional course is added automatically (2% fee)
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default function CertificatePage() {
  const [selectedCourse, setSelectedCourse] =
    useState<CourseInCertificate | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [verificationMode, setVerificationMode] = useState(false);

  const account = useActiveAccount();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function fetchCertificates() {
      setIsLoading(true);
      setError(null);

      try {
        const tokenIdParam = searchParams.get("tokenId");
        const addressParam = searchParams.get("address");

        if (tokenIdParam && addressParam) {
          setVerificationMode(true);
          const certData = await getCertificateByTokenId(tokenIdParam);

          if (certData) {
            const transformed = transformCertificateData(certData);
            setCertificates([transformed]);
          } else {
            setError("Certificate not found or invalid.");
          }
        } else if (account?.address) {
          setVerificationMode(false);
          const certData = await getUserCertificates(account.address);
          const transformed = certData.map(transformCertificateData);
          setCertificates(transformed);
        } else {
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error("[Certificates] Failed to fetch certificates:", err);
        setError(
          "Failed to load certificates from blockchain. Please try again later."
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchCertificates();
  }, [account?.address, searchParams]);

  const handleCourseClick = useCallback((course: CourseInCertificate) => {
    setSelectedCourse(course);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setSelectedCourse(null);
  }, []);

  const handleShareClick = useCallback(() => {
    const cert = certificates[0];
    if (!cert) return;

    if (navigator.share) {
      navigator
        .share({
          title: `${cert.studentName}'s Certificate - ${cert.platformName}`,
          text: `View my blockchain-verified certificate with ${cert.totalCoursesCompleted} completed courses!`,
          url: cert.verificationUrl,
        })
        .catch(() => {
          navigator.clipboard.writeText(cert.verificationUrl);
        });
    } else {
      navigator.clipboard.writeText(cert.verificationUrl);
      alert("Certificate link copied to clipboard!");
    }
  }, [certificates]);

  const handleQRCodeClick = useCallback(() => {
    setShowQRCode(true);
  }, []);

  if (!account && !verificationMode) {
    return (
      <PageContainer maxWidth="xl" className="space-y-6 py-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">My Certificate</h1>
          <p className="text-lg text-muted-foreground">
            Your lifetime blockchain-verified certificate that grows with your
            achievements.
          </p>
        </div>
        <Alert className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please connect your wallet to view your certificates.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer maxWidth="xl" className="space-y-6 py-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">My Certificate</h1>
          <p className="text-lg text-muted-foreground">
            Your lifetime blockchain-verified certificate that grows with your
            achievements.
          </p>
        </div>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">
              Loading your certificate from blockchain...
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Querying Goldsky indexer
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="xl" className="space-y-6 py-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">My Certificate</h1>
          <p className="text-lg text-muted-foreground">
            Your lifetime blockchain-verified certificate that grows with your
            achievements.
          </p>
        </div>
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="mt-4"
        >
          Try Again
        </Button>
      </PageContainer>
    );
  }

  const userCertificate = certificates.length > 0 ? certificates[0] : null;

  return (
    <>
      <PageContainer maxWidth="xl" className="space-y-6 py-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold text-foreground">
              {verificationMode ? "Certificate Verification" : "My Certificate"}
            </h1>
            {verificationMode && (
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                <CheckCircle className="w-3 h-3 mr-1" />
                Verification Mode
              </Badge>
            )}
          </div>
          <p className="text-lg text-muted-foreground">
            {verificationMode
              ? "Viewing blockchain-verified certificate from QR code scan. All data is pulled directly from Manta Pacific blockchain via Goldsky indexer."
              : "Your lifetime blockchain-verified certificate that grows with your achievements. All credentials are permanently stored on Manta Pacific and verifiable on-chain."}
          </p>
        </div>

        {userCertificate ? (
          <CertificateCard
            certificate={userCertificate}
            onCourseClick={handleCourseClick}
            onShareClick={handleShareClick}
            onQRCodeClick={handleQRCodeClick}
          />
        ) : (
          <NoCertificateState />
        )}
      </PageContainer>

      <Sheet
        open={!!selectedCourse}
        onOpenChange={(isOpen) => !isOpen && handleDrawerClose()}
      >
        <SheetContent className="w-full sm:max-w-lg bg-background border-l border-border text-foreground p-0 overflow-y-auto">
          {selectedCourse && (
            <>
              <SheetHeader className="p-6 border-b border-border sticky top-0 bg-background z-10">
                <SheetTitle className="text-foreground text-xl">
                  {selectedCourse.title}
                </SheetTitle>
                <SheetDescription className="text-muted-foreground">
                  Course #{selectedCourse.courseId}
                </SheetDescription>
              </SheetHeader>
              <div className="p-6 space-y-6">
                <div className="relative w-full h-56 rounded-lg overflow-hidden bg-muted shadow-md">
                  <ThumbnailImage
                    cid={selectedCourse.thumbnailCID}
                    alt={selectedCourse.title}
                    fallback={
                      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <BookOpen className="w-16 h-16 text-white/70" />
                      </div>
                    }
                  />
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-secondary rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        Completion Status
                      </span>
                      {selectedCourse.isCompleted ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                          ✓ Completed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">In Progress</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Progress
                      </span>
                      <span className="text-lg font-bold text-foreground">
                        {selectedCourse.completionPercentage}%
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-secondary rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Completed On
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {formatDate(selectedCourse.completedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-secondary rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Added to Certificate
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {formatDate(selectedCourse.addedToCertificateAt)}
                      </span>
                    </div>
                  </div>

                  {selectedCourse.pricePaidEth > 0 && (
                    <div className="p-4 bg-secondary rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Price Paid
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {formatMantaPrice(selectedCourse.pricePaidEth)}
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedCourse.isFirstCourse ? (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-700/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Award className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                        <div>
                          <span className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold block mb-1">
                            🎉 Certificate Minted with This Course
                          </span>
                          <span className="text-xs text-yellow-600 dark:text-yellow-400">
                            Your first course on the certificate (10% platform
                            fee applied)
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Trophy className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                        <div>
                          <span className="text-sm text-green-700 dark:text-green-300 font-semibold block mb-1">
                            Added to Existing Certificate
                          </span>
                          <span className="text-xs text-green-600 dark:text-green-400">
                            Automatically added after completion (2% platform
                            fee)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={showQRCode} onOpenChange={setShowQRCode}>
        <SheetContent className="w-full sm:max-w-md bg-background border-l border-border text-foreground">
          {userCertificate && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="text-foreground">
                  Certificate QR Code
                </SheetTitle>
                <SheetDescription className="text-muted-foreground">
                  Scan to verify on blockchain
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg flex items-center justify-center">
                  <Image
                    src={userCertificate.qrCodeUrl}
                    alt="Certificate QR Code"
                    width={256}
                    height={256}
                    className="w-64 h-64"
                    unoptimized
                  />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Certificate Token ID
                  </p>
                  <p className="text-2xl font-bold text-primary">
                    #{userCertificate.tokenId}
                  </p>
                </div>
                <div className="space-y-3">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => {
                      window.open(userCertificate.verificationUrl, "_blank");
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Verification Page
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => {
                      const link = document.createElement("a");
                      link.href = userCertificate.qrCodeUrl;
                      link.download = `certificate-${userCertificate.tokenId}-qr.png`;
                      link.click();
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download QR Code
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
