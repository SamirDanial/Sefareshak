import React from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import Svg, { Defs, Filter, FeColorMatrix, Image as SvgImage } from "react-native-svg";

type Props = {
  uri: string;
  width: number;
  height: number;
  grayscale?: boolean;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
};

export default function GrayscaleImage({
  uri,
  width,
  height,
  grayscale,
  style,
  borderRadius,
}: Props) {
  const matrix = grayscale
    ? [
        0.33, 0.33, 0.33, 0, 0,
        0.33, 0.33, 0.33, 0, 0,
        0.33, 0.33, 0.33, 0, 0,
        0, 0, 0, 1, 0,
      ]
    : null;

  return (
    <View style={[{ width, height, overflow: "hidden", borderRadius: borderRadius ?? 0 }, style]}>
      <Svg width={width} height={height}>
        {matrix ? (
          <Defs>
            <Filter id="gray">
              <FeColorMatrix type="matrix" values={matrix.join(" ")} />
            </Filter>
          </Defs>
        ) : null}

        <SvgImage
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid slice"
          href={{ uri }}
          filter={matrix ? "url(#gray)" : undefined}
        />
      </Svg>
    </View>
  );
}
