import { useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, Text } from '@/components';
import { useLang } from '@/lib/language';
import { color, radius, space } from '@/theme/tokens';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    glyph: '📋',
    title: 'Everything in one record',
    titleHi: 'सब कुछ एक रिकॉर्ड में',
    body: 'Attendance, timetable, fees, results and certificates — the same record the college office sees.',
    bodyHi: 'उपस्थिति, समय-सारणी, शुल्क, परिणाम और प्रमाण-पत्र — वही रिकॉर्ड जो कॉलेज कार्यालय देखता है।',
  },
  {
    glyph: '📷',
    title: 'Mark attendance by QR',
    titleHi: 'QR से उपस्थिति दर्ज करें',
    body: 'Scan the code your faculty projects at the start of class. No proxy, no register.',
    bodyHi: 'कक्षा के आरंभ में शिक्षक द्वारा दिखाया गया कोड स्कैन करें। न प्रॉक्सी, न रजिस्टर।',
  },
  {
    glyph: '📶',
    title: 'Works with a weak signal',
    titleHi: 'कमज़ोर सिग्नल पर भी चले',
    body: 'Your ID, timetable and last results stay readable offline and sync when you reconnect.',
    bodyHi: 'आपका आईडी, समय-सारणी और पिछला परिणाम ऑफ़लाइन भी पढ़े जा सकते हैं।',
  },
];

export default function Onboarding() {
  const { t, lang, toggle } = useLang();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const last = index === SLIDES.length - 1;

  function next() {
    if (last) {
      router.replace('/login');
      return;
    }
    const to = index + 1;
    scroller.current?.scrollTo({ x: to * width, animated: true });
    setIndex(to);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={toggle} style={styles.lang} accessibilityLabel="Toggle language">
          <Text variant="micro" weight="semibold" tone="slate">
            {lang === 'en' ? 'हिं' : 'EN'}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/login')} hitSlop={10}>
          <Text variant="small" weight="medium" tone="slate">
            {t('Skip', 'छोड़ें')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        style={{ flexGrow: 0 }}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={styles.art}>
              <Text style={{ fontSize: 56, lineHeight: 66 }}>{slide.glyph}</Text>
            </View>
            <Text variant="h1" weight="semibold" center>
              {t(slide.title, slide.titleHi)}
            </Text>
            <Text variant="body" tone="slate" center>
              {t(slide.body, slide.bodyHi)}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
        <Button
          full
          size="lg"
          title={last ? t('Sign in', 'साइन इन करें') : t('Next', 'आगे')}
          onPress={next}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface, justifyContent: 'space-between' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  lang: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.rule,
  },
  slide: { paddingHorizontal: space['3xl'], alignItems: 'center', gap: space.lg },
  art: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: color.page,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  foot: { paddingHorizontal: space.xl, gap: space.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.rule },
  dotOn: { width: 20, backgroundColor: color.marigold },
});
