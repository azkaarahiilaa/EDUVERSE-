"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useActiveAccount } from "thirdweb/react";
import {
  checkEligibilityForCertificate,
  getCertificatePrice,
  getUserCertificateId,
  getCertificateCompletedCourses,
} from "@/services/certificate-blockchain.service";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Award, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useCertificate } from "@/hooks/useCertificate";

interface GetCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: bigint;
  courseTitle: string;
  onSuccess?: () => void;
}

export function GetCertificateModal({
  isOpen,
  onClose,
  courseId,
  courseTitle,
  onSuccess,
}: GetCertificateModalProps) {
  const account = useActiveAccount();
  const address = account?.address;

  const { mintOrUpdateCertificate } = useCertificate();

  const [recipientName, setRecipientName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<
    "input" | "generating" | "minting" | "success"
  >("input");
  const [certificateData, setCertificateData] = useState<{
    ipfsCID: string;
    previewUrl: string;
    metadataCID: string;
  } | null>(null);

  const [actualPrice, setActualPrice] = useState<bigint>(BigInt(0));
  const [priceLoading, setPriceLoading] = useState(true);
  const [existingTokenId, setExistingTokenId] = useState<bigint>(BigInt(0));
  const [existingCourses, setExistingCourses] = useState<bigint[]>([]);
  const [isFirstCertificate, setIsFirstCertificate] = useState(true);
  const [courseAlreadyInCertificate, setCourseAlreadyInCertificate] =
    useState(false);

  const [eligible, setEligible] = useState(true);
  const [eligibilityReason, setEligibilityReason] = useState<string | null>(
    null
  );
  const [checkingEligibility, setCheckingEligibility] = useState(true);

  useEffect(() => {
    async function fetchPriceAndStatus() {
      if (!address || !isOpen) {
        setPriceLoading(false);
        setCheckingEligibility(false);
        return;
      }

      try {
        setPriceLoading(true);
        setCheckingEligibility(true);

        const eligibilityResult = await checkEligibilityForCertificate(
          address,
          courseId
        );
        setEligible(eligibilityResult.eligible);
        setEligibilityReason(eligibilityResult.reason || null);

        const tokenId = await getUserCertificateId(address);
        setExistingTokenId(tokenId);
        const hasExistingCert = tokenId > BigInt(0);
        setIsFirstCertificate(!hasExistingCert);

        if (hasExistingCert) {
          const courses = await getCertificateCompletedCourses(tokenId);
          setExistingCourses(courses);

          const alreadyAdded = courses.some(
            (c) => c.toString() === courseId.toString()
          );
          setCourseAlreadyInCertificate(alreadyAdded);
        }

        const price = await getCertificatePrice(courseId, !hasExistingCert);
        setActualPrice(price);
      } catch (error) {
        console.error(
          "[GetCertificateModal] Error fetching price/status:",
          error
        );
        toast.error("Failed to load certificate status");
      } finally {
        setPriceLoading(false);
        setCheckingEligibility(false);
      }
    }

    fetchPriceAndStatus();
  }, [address, courseId, isOpen]);

  const formatPrice = (priceWei: bigint): string => {
    const priceEth = Number(priceWei) / 1e18;
    return `${priceEth.toFixed(5)} MANTA`;
  };

  const handleMintOrUpdate = async () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }

    if (isFirstCertificate && !recipientName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    if (recipientName.length > 100) {
      toast.error("Name must be 100 characters or less");
      return;
    }

    setIsLoading(true);
    setStep("generating");

    try {
      const requestBody = {
        studentName: isFirstCertificate ? recipientName.trim() : "Update",
        courseName: courseTitle,
        courseId: courseId.toString(),
        recipientAddress: address,
        platformName:
          process.env.NEXT_PUBLIC_PLATFORM_NAME || "EduVerse Academy",
        baseRoute:
          typeof window !== "undefined"
            ? `${window.location.origin}/certificates`
            : "http://localhost:3000/certificates",
        tokenId: isFirstCertificate ? "0" : existingTokenId.toString(),
        completedCourses: isFirstCertificate
          ? [courseId.toString()]
          : [...existingCourses.map((c) => c.toString()), courseId.toString()],
        isValid: true,
        lifetimeFlag: true,
      };

      const response = await fetch("/api/certificate/generate-pinata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate certificate");
      }

      const data = await response.json();

      setCertificateData({
        ipfsCID: data.data.cid,
        previewUrl: data.data.signedUrl,
        metadataCID: data.data.metadataCID || "",
      });

      setStep("minting");
      toast.success(
        isFirstCertificate
          ? "Certificate generated! Minting on blockchain..."
          : "Adding course to certificate..."
      );

      const baseRoute =
        typeof window !== "undefined"
          ? `${window.location.origin}/certificates`
          : `${
              process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
            }/certificates`;

      await mintOrUpdateCertificate(
        courseId,
        isFirstCertificate ? recipientName.trim() : "Update",
        data.data.cid,
        baseRoute
      );

      setStep("success");
      toast.success(
        isFirstCertificate
          ? "Certificate minted successfully! 🎉"
          : "Course added to certificate! 🎉"
      );

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("[GetCertificateModal] Process error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to process certificate"
      );
      setStep("input");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setStep("input");
      setRecipientName("");
      setCertificateData(null);
      onClose();
    }
  };

  const renderContent = () => {
    if (checkingEligibility || priceLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Checking eligibility...
          </p>
        </div>
      );
    }

    if (!eligible) {
      return (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <div className="text-center space-y-2">
            <p className="font-medium text-destructive">Not Eligible</p>
            <p className="text-sm text-muted-foreground">
              {eligibilityReason || "You are not eligible for this certificate"}
            </p>
          </div>
        </div>
      );
    }

    if (courseAlreadyInCertificate) {
      return (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
          <div className="text-center space-y-2">
            <p className="font-medium">Already Added</p>
            <p className="text-sm text-muted-foreground">
              This course is already in your certificate
            </p>
          </div>
        </div>
      );
    }

    switch (step) {
      case "input":
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {isFirstCertificate
                    ? "First Certificate"
                    : "Add to Existing Certificate"}
                </p>
                <p className="text-sm text-muted-foreground">{courseTitle}</p>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm">Price:</span>
                  <span className="font-medium">
                    {formatPrice(actualPrice)}
                  </span>
                </div>
              </div>
            </div>

            {isFirstCertificate && (
              <div className="space-y-2">
                <Label htmlFor="recipientName">Your Full Name</Label>
                <Input
                  id="recipientName"
                  placeholder="Enter your name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  maxLength={100}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  This name will appear on your certificate
                </p>
              </div>
            )}

            <Button
              onClick={handleMintOrUpdate}
              disabled={
                isLoading || (isFirstCertificate && !recipientName.trim())
              }
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Award className="mr-2 h-4 w-4" />
                  {isFirstCertificate
                    ? `Get Certificate (${formatPrice(actualPrice)})`
                    : `Add Course (${formatPrice(actualPrice)})`}
                </>
              )}
            </Button>
          </div>
        );

      case "generating":
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Generating certificate image...
            </p>
          </div>
        );

      case "minting":
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {isFirstCertificate
                ? "Minting certificate on blockchain..."
                : "Adding course to certificate..."}
            </p>
            <p className="text-xs text-muted-foreground">
              Please confirm the transaction in your wallet
            </p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <div className="text-center space-y-2">
              <p className="font-medium">Success!</p>
              <p className="text-sm text-muted-foreground">
                {isFirstCertificate
                  ? "Your certificate has been minted"
                  : "Course added to your certificate"}
              </p>
            </div>
            {certificateData && (
              <a
                href={certificateData.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Certificate
              </a>
            )}
            <Button onClick={handleClose} className="mt-4">
              Close
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            {isFirstCertificate
              ? "Get Certificate"
              : "Add Course to Certificate"}
          </DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
