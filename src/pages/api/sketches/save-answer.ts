import { NextApiRequest, NextApiResponse } from "next";
import config from "@/utils/config";
import updateImagesInvalidTagsCount from "@/utils/aws/updateImagesInvalidTagsCount";
import updateImagesDisplayCount from "@/utils/aws/updateImagesDisplayCount";
import Cookies from "cookies";
import getCookiesServer from "@/utils/getCookiesServer";
import { updateConceptDisplayCount } from "@/utils/aws/updateConceptDisplayCount";
import { ConceptInfo } from "@/types/ConceptInfo";

// Best way to weight the output is to multiply gallerize-user-id-weight

// First things first, we need to check if he selected all invalid ones
// If he did, there's a good chance that he's thinking

// Then we need to check how many valid ones he tagged as invalid
// If he tagged more than 2, we need to increase their count, but also
// decrease his weight

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(400).json({ message: "This method is not allowed" });
    }

    const cookies = new Cookies(req, res);

    const { userId, userWeight, selectedConcept } = getCookiesServer(cookies);

    if (!userId) {
      return res.status(400).json({ message: "User id not found" });
    }

    let penalty = 0;

    const { randomImages, taggedImages, invalidIdsCount } = req.body;
    const invalidConcept = new Set(
      randomImages
        .map((image: any) => image.concept)
        .filter((concept: string) => concept !== selectedConcept)
    );

    const validImages = taggedImages.filter((image: any) => image.valid);
    const invalidImages = randomImages.filter((image: any) => !image.valid);

    // We want to update the display count for all images and concepts ALWAYS
    await updateImagesDisplayCount(invalidImages);
    await updateConceptDisplayCount(Array.from(invalidConcept)[0] as string);

    const invalidImagesTaggedCount = taggedImages.filter(
      (image: any) => !image.valid
    ).length;

    // If the user tagged all invalid images, we need to increase his weight
    // It means that he's thinking
    if (
      invalidImagesTaggedCount === invalidIdsCount &&
      taggedImages.length === invalidImagesTaggedCount
    ) {
      return res.json({ reward: config.reward });
    }

    penalty +=
      (invalidIdsCount - invalidImagesTaggedCount) * config.invalidTagPenalty;

    if (validImages.length > 1) {
      penalty += (validImages.length - 1) * config.validTagPenalty;
    }

    await updateImagesInvalidTagsCount(
      validImages,
      Number(userWeight) * (1 - penalty)
    );

    return res.json({ penalty: 1 - penalty });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}

export default handler;
