import type { Page } from "playwright";
import type { UiDesignComparison } from "../../shared/types/ui-audit";

interface CompareUiDesignInput {
  referenceBytes: Buffer;
  referenceContentType: "image/png" | "image/jpeg";
  referenceWidth: number;
  referenceHeight: number;
  actualBytes: Buffer;
  actualWidth: number;
  actualHeight: number;
}

export interface ComparedUiDesign {
  summary: UiDesignComparison;
  diffBytes: Buffer;
}

const changedPixelThreshold = 32;

export async function compareUiDesign(page: Page, input: CompareUiDesignInput): Promise<ComparedUiDesign> {
  const result = await page.evaluate(async ({ referenceUrl, actualUrl, referenceWidth, referenceHeight, actualWidth, actualHeight, threshold }) => {
    const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("이미지를 해석하지 못했습니다."));
      image.src = url;
    });
    const [reference, actual] = await Promise.all([load(referenceUrl), load(actualUrl)]);
    const sampleWidth = Math.min(240, actualWidth);
    const sampleHeight = Math.max(1, Math.round(sampleWidth * actualHeight / actualWidth));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("이미지 비교 화면을 만들지 못했습니다.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(reference, 0, 0, sampleWidth, sampleHeight);
    const referencePixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    context.clearRect(0, 0, sampleWidth, sampleHeight);
    context.drawImage(actual, 0, 0, sampleWidth, sampleHeight);
    const actualPixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const changed: number[] = [];
    let totalDifference = 0;
    for (let offset = 0, pixel = 0; offset < actualPixels.length; offset += 4, pixel += 1) {
      const difference = (
        Math.abs(referencePixels[offset]! - actualPixels[offset]!) +
        Math.abs(referencePixels[offset + 1]! - actualPixels[offset + 1]!) +
        Math.abs(referencePixels[offset + 2]! - actualPixels[offset + 2]!)
      ) / 3;
      totalDifference += difference;
      if (difference >= threshold) changed.push(pixel);
    }
    const pixelCount = sampleWidth * sampleHeight;
    const differencePercent = Number((changed.length / pixelCount * 100).toFixed(1));
    const meanDifferencePercent = Number((totalDifference / pixelCount / 255 * 100).toFixed(1));
    const diff = document.createElement("canvas");
    diff.width = actualWidth;
    diff.height = actualHeight;
    const diffContext = diff.getContext("2d");
    if (!diffContext) throw new Error("차이 강조 화면을 만들지 못했습니다.");
    diffContext.drawImage(actual, 0, 0, actualWidth, actualHeight);
    diffContext.fillStyle = "rgba(220, 38, 38, .42)";
    const cellWidth = actualWidth / sampleWidth;
    const cellHeight = actualHeight / sampleHeight;
    for (const pixel of changed) {
      diffContext.fillRect(
        (pixel % sampleWidth) * cellWidth,
        Math.floor(pixel / sampleWidth) * cellHeight,
        Math.ceil(cellWidth),
        Math.ceil(cellHeight)
      );
    }
    return {
      differencePercent,
      meanDifferencePercent,
      diffDataUrl: diff.toDataURL("image/png"),
      dimensionMismatch: referenceWidth !== actualWidth || referenceHeight !== actualHeight
    };
  }, {
    referenceUrl: `data:${input.referenceContentType};base64,${input.referenceBytes.toString("base64")}`,
    actualUrl: `data:image/png;base64,${input.actualBytes.toString("base64")}`,
    referenceWidth: input.referenceWidth,
    referenceHeight: input.referenceHeight,
    actualWidth: input.actualWidth,
    actualHeight: input.actualHeight,
    threshold: changedPixelThreshold
  });
  const differenceStatus: UiDesignComparison["status"] = result.differencePercent <= 2
    ? "matched"
    : result.differencePercent <= 20
      ? "review"
      : "different";
  const status = result.dimensionMismatch && differenceStatus === "matched" ? "review" : differenceStatus;
  return {
    summary: {
      status,
      differencePercent: result.differencePercent,
      meanDifferencePercent: result.meanDifferencePercent,
      dimensionMismatch: result.dimensionMismatch,
      referenceWidth: input.referenceWidth,
      referenceHeight: input.referenceHeight,
      actualWidth: input.actualWidth,
      actualHeight: input.actualHeight
    },
    diffBytes: Buffer.from(result.diffDataUrl.split(",")[1] || "", "base64")
  };
}
