import MdiIcon from '@mdi/react';

interface IconProps {
  path: string;
  size?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Icon wrapper component using Material Design Icons.
 * This provides consistent icon usage matching the mobile app's MaterialCommunityIcons.
 * 
 * Size reference:
 * - size={1} = 24px (default)
 * - size={0.67} = 16px
 * - size={0.5} = 12px
 * - size={0.83} = 20px
 * - size={1.5} = 36px
 * 
 * For className sizing (h-4 w-4 = 16px), use size={0.67}
 */
export function Icon({ path, size = 1, color, className, style }: IconProps) {
  return (
    <MdiIcon
      path={path}
      size={size}
      color={color}
      className={className}
      style={style}
    />
  );
}

export default Icon;

