import { color, font, type } from "./tokens.js";

/**
 * SectionLabel — eyebrow / section divider using the label type scale.
 * @param {{ children: React.ReactNode, style?: object }} props
 */
export function SectionLabel({ children, style = {} }) {
  return (
    <div
      className="sec-divider"
      style={{
        ...type.label,
        color: color.textDim,
        fontFamily: font.display,
        marginBottom: 9,
        display: "flex",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
