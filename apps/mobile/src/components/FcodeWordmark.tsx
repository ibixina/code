import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

export function FcodeWordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 80 / 53;
  return (
    <Svg
      accessibilityLabel="fcode"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="24 37 80 53"
    >
      <ThemedPath
        d="M24 90V37H63V49H38V58H58V70H38V90H24ZM68 77H104V90H68Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
