import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const APP_MODE_KEY = 'appMode';

export default function ModeSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [selecting, setSelecting] = useState<string | null>(null);

  const handleSelect = async (mode: 'pos' | 'management') => {
    if (selecting) return;
    setSelecting(mode);
    try {
      await AsyncStorage.setItem(APP_MODE_KEY, mode);
      if (mode === 'pos') {
        router.replace('/(admin)/pos' as any);
      } else {
        router.replace('/(admin)' as any);
      }
    } catch {
      setSelecting(null);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <MaterialCommunityIcons name="tablet" size={36} color="#ec4899" />
        <Text style={styles.title}>{t('modeSelect.title')}</Text>
        <Text style={styles.subtitle}>{t('modeSelect.subtitle')}</Text>
      </View>

      <View style={styles.tiles}>
        {/* POS Mode tile */}
        <TouchableOpacity
          style={[styles.tile, styles.tilePOS]}
          onPress={() => handleSelect('pos')}
          disabled={!!selecting}
          activeOpacity={0.8}
        >
          <View style={styles.tileIconWrap}>
            {selecting === 'pos' ? (
              <ActivityIndicator size="large" color="#ec4899" />
            ) : (
              <MaterialCommunityIcons name="cash-register" size={48} color="#ec4899" />
            )}
          </View>
          <Text style={styles.tileTitle}>{t('modeSelect.posTitle')}</Text>
          <Text style={styles.tileDesc}>{t('modeSelect.posDesc')}</Text>
          <View style={styles.tileArrow}>
            <MaterialCommunityIcons name="arrow-right-circle" size={22} color="#ec4899" />
          </View>
        </TouchableOpacity>

        {/* Management Mode tile */}
        <TouchableOpacity
          style={[styles.tile, styles.tileManagement]}
          onPress={() => handleSelect('management')}
          disabled={!!selecting}
          activeOpacity={0.8}
        >
          <View style={styles.tileIconWrap}>
            {selecting === 'management' ? (
              <ActivityIndicator size="large" color="#6366f1" />
            ) : (
              <MaterialCommunityIcons name="view-dashboard-outline" size={48} color="#6366f1" />
            )}
          </View>
          <Text style={[styles.tileTitle, styles.tileTitleManagement]}>{t('modeSelect.managementTitle')}</Text>
          <Text style={styles.tileDesc}>{t('modeSelect.managementDesc')}</Text>
          <View style={styles.tileArrow}>
            <MaterialCommunityIcons name="arrow-right-circle" size={22} color="#6366f1" />
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => handleSelect('management')}
        disabled={!!selecting}
        style={styles.skipButton}
      >
        <Text style={styles.skipText}>{t('modeSelect.skip')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const { width } = Dimensions.get('window');
const IS_TABLET = width >= 768;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    gap: 10,
  },
  title: {
    fontSize: IS_TABLET ? 28 : 22,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: 20,
  },
  tiles: {
    flexDirection: IS_TABLET ? 'row' : 'column',
    gap: 16,
    width: '100%',
    maxWidth: 720,
  },
  tile: {
    flex: 1,
    borderRadius: 20,
    padding: 28,
    gap: 10,
    borderWidth: 1,
    minHeight: 220,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  tilePOS: {
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    borderColor: 'rgba(236, 72, 153, 0.35)',
  },
  tileManagement: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  tileIconWrap: {
    marginBottom: 4,
    height: 56,
    justifyContent: 'center',
  },
  tileTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ec4899',
  },
  tileTitleManagement: {
    color: '#818cf8',
  },
  tileDesc: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
  },
  tileArrow: {
    marginTop: 8,
  },
  skipButton: {
    marginTop: 28,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  skipText: {
    fontSize: 13,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
});
