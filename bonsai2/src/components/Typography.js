import { useState, useEffect } from "react";

// Hook to detect mobile
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
};

// H component - replaces h1, h2, h3, etc.
export const H = ({ level = 1, style = {}, children, ...props }) => {
  const isMobile = useIsMobile();

  // Extract fontSize from style, reduce by 4px on mobile, max 24px
  const fontSize = style.fontSize || "16px";
  const fontSizeNum = parseInt(fontSize);
  const reducedSize = fontSizeNum - 4;
  const adjustedFontSize = isMobile
    ? `${Math.min(reducedSize, 24)}px`
    : fontSize;

  return (
    <div
      style={{
        ...style,
        fontSize: adjustedFontSize,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

// P component - replaces p tags
export const P = ({ style = {}, children, ...props }) => {
  const isMobile = useIsMobile();

  // Extract fontSize from style, reduce by 2px on mobile, max 24px
  const fontSize = style.fontSize || "16px";
  const fontSizeNum = parseInt(fontSize);
  const reducedSize = fontSizeNum - 2;
  const adjustedFontSize = isMobile
    ? `${Math.min(reducedSize, 24)}px`
    : fontSize;

  return (
    <div
      style={{
        ...style,
        fontSize: adjustedFontSize,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
