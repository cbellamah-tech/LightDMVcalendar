import { Composition } from "remotion";
import { DailyReel, ReelProps, reelFrames, FPS } from "./DailyReel";

const sample: ReelProps = {
  headline: "Lighting up the DMV",
  photos: [],
  towns: [],
  phone: "(703) 951-5100",
  site: "lightdmv.com",
  cta: "Book your install",
};

export const Root = () => (
  <Composition
    id="DailyReel"
    component={DailyReel}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={reelFrames(sample.photos.length)}
    defaultProps={sample}
    calculateMetadata={({ props }) => ({ durationInFrames: reelFrames(props.photos.length) })}
  />
);
