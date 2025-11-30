/**
 * CertificateCard Component
 *
 * Visual mockup card for displaying certificate status and claiming functionality.
 * Shows certificate preview, eligibility status, pricing, and action buttons.
 */

"use client";

import { Award, Check, Download, ExternalLink, Lock, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CertificateCardProps {
  courseId: number;
  courseTitle: string;
  isCompleted: boolean;
  hasLicense: boolean;
  certificatePrice: bigint;
  alreadyClaimed: boolean;
  certificateId?: string;
  onClaim?: () => void;
  onView?: () => void;
  className?: string;
}

export function CertificateCard({
  courseTitle,
  isCompleted,
  hasLicense,
  certificatePrice,
  alreadyClaimed,
  certificateId,
  onClaim,
  onView,
  className
}: CertificateCardProps) {
  // Format price from Wei to ETH
  const formatPrice = (priceWei: bigint): string => {
    const priceEth = Number(priceWei) / 1e18;
    return `${priceEth.toFixed(5)} ETH`;
  };

  // Determine eligibility status
  const canClaim = isCompleted && hasLicense && !alreadyClaimed;
  const needsCompletion = !isCompleted;
  const needsLicense = !hasLicense && isCompleted;

  // Status badge configuration
  const getStatusBadge = () => {
    if (alreadyClaimed) {
      return {
        label: 'Certificate Claimed',
        variant: 'default' as const,
        icon: Check,
        className: 'bg-green-500/10 text-green-500 border-green-500/20'
      };
    }
    if (canClaim) {
      return {
        label: 'Eligible to Claim',
        variant: 'default' as const,
        icon: Sparkles,
        className: 'bg-primary/10 text-primary border-primary/20'
      };
    }
    if (needsCompletion) {
      return {
        label: 'Complete Course First',
        variant: 'secondary' as const,
        icon: Lock,
        className: 'bg-muted text-muted-foreground border-border'
      };
    }
    if (needsLicense) {
      return {
        label: 'License Required',
        variant: 'secondary' as const,
        icon: Lock,
        className: 'bg-muted text-muted-foreground border-border'
      };
    }
    return {
      label: 'Not Available',
      variant: 'secondary' as const,
      icon: Lock,
      className: 'bg-muted text-muted-foreground border-border'
    };
  };

  const statusBadge = getStatusBadge();
  const StatusIcon = statusBadge.icon;

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300",
      canClaim && "border-primary/50 shadow-lg shadow-primary/10",
      alreadyClaimed && "border-green-500/30",
      className
    )}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-3 rounded-lg",
              alreadyClaimed ? "bg-green-500/10" : canClaim ? "bg-primary/10" : "bg-muted"
            )}>
              <Award className={cn(
                "h-6 w-6",
                alreadyClaimed ? "text-green-500" : canClaim ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg leading-tight">
                Course Certificate
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-1">
                {courseTitle}
              </p>
            </div>
          </div>
          <Badge
            variant={statusBadge.variant}
            className={cn("whitespace-nowrap flex items-center gap-1", statusBadge.className)}
          >
            <StatusIcon className="h-3 w-3" />
            {statusBadge.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-4">
        {/* Certificate Preview */}
        <div className={cn(
          "relative rounded-lg border-2 border-dashed overflow-hidden",
          alreadyClaimed ? "border-green-500/30" : canClaim ? "border-primary/30" : "border-border"
        )}>
          <div className={cn(
            "aspect-[16/10] flex flex-col items-center justify-center",
            alreadyClaimed ? "bg-green-500/5" : canClaim ? "bg-primary/5" : "bg-muted/50"
          )}>
            <Award className={cn(
              "h-16 w-16 mb-3",
              alreadyClaimed ? "text-green-500/30" : canClaim ? "text-primary/30" : "text-muted-foreground/20"
            )} />
            <p className="text-sm font-medium text-muted-foreground">
              {alreadyClaimed ? 'Certificate Acquired' : canClaim ? 'Ready to Claim' : 'Certificate Preview'}
            </p>
            {alreadyClaimed && certificateId && (
              <p className="text-xs text-muted-foreground mt-1">
                ID: {certificateId}
              </p>
            )}
          </div>

          {/* Shimmer effect for eligible certificates */}
          {canClaim && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-shimmer" />
          )}
        </div>

        {/* Certificate Features */}
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
            <span>Lifetime valid NFT certificate</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
            <span>Blockchain-verified with QR code</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
            <span>90% revenue to course creator</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
            <span>Cumulative learning credential</span>
          </div>
        </div>

        {/* Pricing (only show if not claimed) */}
        {!alreadyClaimed && (
          <div className={cn(
            "rounded-lg border p-3 space-y-1",
            canClaim ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-border"
          )}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Certificate Fee
              </span>
              <span className={cn(
                "text-lg font-bold",
                canClaim ? "text-primary" : "text-muted-foreground"
              )}>
                {formatPrice(certificatePrice)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {canClaim
                ? "One-time payment for lifetime certificate"
                : "Complete requirements to unlock"
              }
            </p>
          </div>
        )}

        {/* Requirements (if not eligible) */}
        {!canClaim && !alreadyClaimed && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs font-medium text-muted-foreground">Requirements:</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {isCompleted ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={isCompleted ? "text-green-500" : "text-muted-foreground"}>
                  Complete all course sections
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {hasLicense ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={hasLicense ? "text-green-500" : "text-muted-foreground"}>
                  Have owned a course license
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        {alreadyClaimed ? (
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={onView}
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {/* TODO: Implement download */ }}
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        ) : canClaim ? (
          <Button
            onClick={onClaim}
            className="w-full"
            size="lg"
          >
            <Award className="h-4 w-4 mr-2" />
            Get Certificate
          </Button>
        ) : (
          <Button
            disabled
            variant="secondary"
            className="w-full"
            size="lg"
          >
            <Lock className="h-4 w-4 mr-2" />
            {needsCompletion ? 'Complete Course First' : 'License Required'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// Add shimmer animation to globals.css
// @keyframes shimmer {
//   0% { transform: translateX(-100%); }
//   100% { transform: translateX(100%); }
// }
// .animate-shimmer {
//   animation: shimmer 2s infinite;
// }
