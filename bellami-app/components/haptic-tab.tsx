import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  const disabled = Boolean(props.disabled);

  return (
    <PlatformPressable
      {...props}
      style={[props.style, disabled ? { opacity: 0.45 } : null]}
      disabled={disabled}
      onPress={disabled ? undefined : props.onPress}
      onPressIn={(ev) => {
        if (disabled) return;
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
