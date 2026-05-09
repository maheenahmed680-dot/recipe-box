import BoxBack from '@/assets/images/box_back.svg';
import BoxFront from '@/assets/images/box_front.svg';
import RecipeCard from '@/assets/images/recipe_card.svg';
import { Grandstander_400Regular, useFonts } from '@expo-google-fonts/grandstander';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Dimensions, InputAccessoryView, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Extrapolation,
  interpolate,
  measure,
  runOnJS,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const RECIPES = [
  {
    id: 0,
    title: "Healthy Banana Bread",
    cookTime: "14 mins",
    servings: "8 slices",
    calories: '',
    pan: "8-inch round springform — line bottom with parchment, lightly grease sides.",
    ingredientGroups: [
      { group: "Dry", items: [
        { text: "¾ cup oat flour", note: "blend oats first if needed" },
        { text: "¼ tsp baking powder" },
        { text: "⅛ tsp baking soda" },
        { text: "Pinch of salt" },
        { text: "Cinnamon (optional)" },
      ]},
      { group: "Wet", items: [
        { text: "2 medium bananas", note: "even if ripe, roast till mostly black in the oven every time — trust me!" },
        { text: "Dates 6 – 1 tbsp date paste" },
        { text: "2 eggs" },
        { text: "1 tbsp maple syrup (with dates: ½ tbsp)" },
        { text: "1 tbsp erythritol (to taste)" },
        { text: "1 tbsp coconut sugar" },
        { text: "1 tbsp vanilla extract" },
      ]},
      { group: "Chocolate", items: [
        { text: "1½ tbsp milk chocolate chips (~18–20g total)" },
      ]},
    ],
    stepGroups: [
      { group: null, items: [
        { step: 1, text: "Blend dry first — pulse oats to flour, add baking powder, soda, salt, cinnamon. Pulse until mixed." },
        { step: 2, text: "Add wet on top — banana, eggs, maple syrup, erythritol, vanilla." },
        { step: 3, text: "Pulse gently — 5–6 short pulses ONLY. Stop as soon as smooth." },
        { step: 4, text: "Rest batter 10 minutes. May stay runny — that's OK." },
        { step: 5, text: "Add chocolate — mix ½ tbsp into batter, sprinkle 1 tbsp on top." },
        { step: 6, text: "Pour into pan." },
      ]},
      { group: "Baking", items: [
        { text: "170°C fan" },
        { text: "14 minutes ONLY" },
        { text: "Edges set, center soft" },
        { text: "Toothpick = moist crumbs" },
      ]},
    ],
  },
];

function stripNoise(lines: string[]): string[] {
  return lines.filter(line => {
    const t = line.trim();
    if (!t) return false;
    if (/^[⸻—\-]{2,}d?$/.test(t)) return false;
    if (/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\s]+$/u.test(t)) return false;
    if (/^#\w+/.test(t)) return false;
    if (/\d+\s*(kcal|cal)|calories?/i.test(t)) return false;
    if (/comment|follow|link in bio|dm me|sign up|subscribe|click|visit|swipe|save this|tag a/i.test(t)) return false;
    if (/^(cutting|cooling|to eat|storage|leftovers|notes?:|tip:)/i.test(t)) return false;
    if (/^⛔|^👉\s*(total|approx)/i.test(t)) return false;
    if (/@\w+\s*$/.test(t)) return false;
    if (/^⸻/.test(t)) return false;
    if (/^(maple syrup|lemon juice|optional erythritol|vanilla sugar|erythritol|coconut sugar|erythritol):/i.test(t)) return false;
    if (/^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) return false;
    return true;
  });
}

function cleanIngredientLine(line: string): string {
  line = line.replace(/⸻/g, '').trim();
  if (!line) return '';
  return line
    .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+\s*/u, '')
    .replace(/^[-•*–\t]\s*/, '')
    .trim();
}

function isGroupHeading(line: string): boolean {
  const t = line.trim();
  const clean = t
    .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}🔹]+\s*/u, '')
    .replace(/^[0-9]+[️⃣]*\s*/, '')
    .replace(/[-•*–:]/g, '')
    .trim();
  if (clean.length === 0 || clean.length > 50) return false;
  if (/^(dry|wet|sauce|marinade|batter|base|topping|filling|caramel|chocolate|mix.?in|additional|spices|homemade|add.?in)/i.test(clean)) return true;
  if (/^(wet|dry|for the|for rice)\s/i.test(clean)) return true;
  if (t.endsWith(':') && clean.split(' ').length >= 2 && clean.split(' ').length <= 5 && !/\d/.test(clean)) return true;
  if (/^🔹/.test(t) && !/\d/.test(clean)) return true;
  return false;
}

function isStepGroupHeading(line: string): boolean {
  const t = line.trim();
  const clean = t
    .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}🔥]+\s*/u, '')
    .replace(/^[0-9]+[️⃣]*[\.\)]\s*/, '')
    .trim();
  if (/^(baking|cooling|chill|assemble|assembly|caramel|base|cream|chocolate|cut)/i.test(clean)) return true;
  return false;
}

function findSectionIndex(lines: string[], keywords: string[]): number {
  return lines.findIndex(l =>
    keywords.some(k =>
      new RegExp(`^[\\s\\W]*${k}`, 'i').test(
        l.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]/gu, '')
      )
    )
  );
}

function extractTitle(lines: string[]): string {
  for (const line of lines) {
    const clean = line
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]/gu, '')
      .replace(/\(\d+.*?\)/g, '')
      .replace(/[^\w\s\-'&]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length > 3) {
      return clean.replace(/\b\w/g, c => c.toUpperCase()).trim();
    }
  }
  return 'My Recipe';
}

function parseRecipeWithAI(rawText: string): Promise<any> {
  return new Promise((resolve) => {
    const allLines = rawText.split('\n').map(l => l.trim());
    const lines = stripNoise(allLines);

    const ingredientKeywords = ['ingredient', 'what you need', "you'll need"];
    const stepKeywords = ['method', 'instruction', 'direction', 'how to make', 'steps', 'to make', 'to compile', 'step-by-step'];

    let ingredientStart = findSectionIndex(lines, ingredientKeywords);
    let stepStart = findSectionIndex(lines, stepKeywords);

    if (ingredientStart === -1) ingredientStart = 1;
    if (stepStart === -1) stepStart = Math.floor(lines.length / 2);

    const titleLines = lines.slice(0, ingredientStart);
    const ingredientLines = lines.slice(ingredientStart + 1, stepStart);
    const stepLines = lines.slice(stepStart + 1);

    const title = extractTitle(titleLines);

    const cookTimeMatch = rawText.match(/(\d+[\-–]\d+|\d+)\s*(min|minute|hour|hr)/i);
    const cookTime = cookTimeMatch ? `${cookTimeMatch[1]} ${cookTimeMatch[2]}s` : '';

    const servingsMatch = rawText.match(/(\d+)\s*(serving|slice|portion|piece|bagel|roll|cookie|loaf|ball|square|ramekin)/i);
    const servings = servingsMatch ? `${servingsMatch[1]} ${servingsMatch[2]}s` : '';

    const calorieMatch = rawText.match(/total[:\s]*~?(\d+)\s*kcal|(\d+)\s*kcal\s*per|^~?(\d+)\s*kcal/im);
    const calories = calorieMatch
      ? `${calorieMatch[1] ?? calorieMatch[2] ?? calorieMatch[3]} kcal`
      : '';

    const ingredientGroups: any[] = [];
    let currentGroup: string | null = null;
    let currentItems: any[] = [];

    for (const line of ingredientLines) {
      if (!line.trim()) continue;
      if (isGroupHeading(line)) {
        if (currentItems.length > 0) {
          ingredientGroups.push({ group: currentGroup, items: currentItems });
          currentItems = [];
        }
        currentGroup = line
          .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}🔹]+\s*/u, '')
          .replace(/:$/, '')
          .trim();
      } else {
        const text = cleanIngredientLine(line);
        if (text.length > 0) {
          currentItems.push({ text, note: null });
        }
      }
    }
    if (currentItems.length > 0) {
      ingredientGroups.push({ group: currentGroup, items: currentItems });
    }

    const stepGroups: any[] = [];
    let currentStepGroup: string | null = null;
    let currentSteps: any[] = [];
    let stepCounter = 1;

    for (const line of stepLines) {
      if (!line.trim()) continue;
      if (isStepGroupHeading(line)) {
        if (currentSteps.length > 0) {
          stepGroups.push({ group: currentStepGroup, items: currentSteps });
          currentSteps = [];
        }
        currentStepGroup = line
          .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}🔥]+\s*/u, '')
          .replace(/^[0-9]+[️⃣]*[\.\)]\s*/, '')
          .replace(/:$/, '')
          .trim();
      } else {
        const clean = line
          .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+\s*/u, '')
          .replace(/^\d+[️⃣]*[.\)]\s*/, '')
          .replace(/^[-–•\t]\s*/, '')
          .trim();
        if (clean.length > 0) {
          currentSteps.push({ step: stepCounter++, text: clean });
        }
      }
    }
    if (currentSteps.length > 0) {
      stepGroups.push({ group: currentStepGroup, items: currentSteps });
    }

    resolve({
      title,
      cookTime,
      servings,
      calories,
      pan: null,
      ingredientGroups: ingredientGroups.length > 0
        ? ingredientGroups
        : [{ group: null, items: ingredientLines.map(l => ({ text: cleanIngredientLine(l), note: null })).filter(i => i.text.length > 0) }],
      stepGroups: stepGroups.length > 0
        ? stepGroups
        : [{ group: null, items: stepLines.map((l, i) => ({ step: i + 1, text: cleanIngredientLine(l) })).filter(i => i.text.length > 0) }],
    });
  });
}

// ---------- Layout constants (unchanged) ----------
const { width } = Dimensions.get('window');
const BOX_WIDTH = width * 1.2;
const BOX_HEIGHT = BOX_WIDTH * (700 / 800);
const CARD_WIDTH = BOX_WIDTH * 0.58;
const CARD_HEIGHT = CARD_WIDTH * (165 / 175);

const CARD_INDICES = [8, 7, 6, 5, 4, 3, 2, 1, 0];
const NUM_CARDS = CARD_INDICES.length;
const BASE_LEFT_0 = BOX_WIDTH * 0.11;
const CARD_STEP = 6;
const DRAG_PER_CARD = 8;

const CARD_NAMES = [
  'Healthy Banana Bread',
  'Spiced Chai Cake',
  'Mango Lassi',
  'Dal Makhani',
  'Palak Paneer',
  'Chicken Biryani',
  'Tandoori Salmon',
  'Aloo Paratha',
  'Kheer',
];

// ---------- Interaction constants ----------
// States: 0=FANNED, 1=SELECTED, 2=EXPANDING, 3=FULL_SCREEN, 4=COLLAPSING
const FANNED = 0;
const SELECTED = 1;
const EXPANDING = 2;
const FULL_SCREEN = 3;
const COLLAPSING = 4;

const LONG_PRESS_DURATION = 1300;
const PULL_UP_THRESHOLD = -150;
const PULL_DOWN_THRESHOLD = 200;
const DRAG_RESISTANCE = 0.8;

const SELECT_SPRING = { damping: 12, stiffness: 200 };
const EXPAND_SPRING = { damping: 20, stiffness: 150, mass: 0.8 };

// ---------- AnimatedCard ----------
type AnimatedCardProps = {
  cardIndex: number;
  recipeName: string;
  // Fan browse (legacy)
  isUnlocked: SharedValue<number>;
  dragX: SharedValue<number>;
  // New interaction layer
  interactionState: SharedValue<number>;
  selectedIndex: SharedValue<number>;
  pullY: SharedValue<number>;
  expandProgress: SharedValue<number>;
  cardOriginX: SharedValue<number>;
  cardOriginY: SharedValue<number>;
  screenW: number;
  screenH: number;
  baseTop: number;
  baseLeft: number;
};

function AnimatedCard({
  cardIndex,
  recipeName,
  isUnlocked,
  dragX,
  interactionState,
  selectedIndex,
  pullY,
  expandProgress,
  cardOriginX,
  cardOriginY,
  screenW,
  screenH,
  baseTop,
  baseLeft,
}: AnimatedCardProps) {
  const cardRef = useAnimatedRef<Animated.View>();

  // ---------- Main card animation ----------
  const animStyle = useAnimatedStyle(() => {
    const state = interactionState.value;
    const isSelected = selectedIndex.value === cardIndex ? 1 : 0;
    const isOther = selectedIndex.value >= 0 && selectedIndex.value !== cardIndex ? 1 : 0;

    // Fan browse (existing behavior, only when FANNED and no selection in progress)
    const fanActive = state === FANNED ? isUnlocked.value : 0;
    const focusedIndex = Math.min(
      Math.max(Math.floor((dragX.value / DRAG_PER_CARD) + 0.35), 0),
      NUM_CARDS - 1,
    );
    const isFanFocused = focusedIndex === cardIndex ? 1 : 0;
    const fanLiftY = fanActive * isFanFocused * -20;
    const fanScale = 1 + fanActive * isFanFocused * 0.05;

    // SELECTED state
    if (state === SELECTED && isSelected) {
      const pullDrag = pullY.value * DRAG_RESISTANCE;
      const pullScale = interpolate(
        pullY.value,
        [0, PULL_UP_THRESHOLD],
        [1.08, 1.15],
        Extrapolation.CLAMP,
      );
      return {
        transform: [
          { translateY: -20 + pullDrag },
          { scale: pullScale },
        ],
        opacity: 1,
        zIndex: 100,
        shadowOpacity: 0.25,
        shadowRadius: 12,
      };
    }

    // SELECTED state — other cards dim
    if (state === SELECTED && isOther) {
      return {
        transform: [
          { translateY: fanLiftY },
          { scale: 0.95 },
        ],
        opacity: 0.4,
        zIndex: 0,
      };
    }

    // EXPANDING / FULL_SCREEN — selected card interpolates to full screen
    if ((state === EXPANDING || state === FULL_SCREEN || state === COLLAPSING) && isSelected) {
      const p = expandProgress.value;
      const targetX = -cardOriginX.value;
      const targetY = -cardOriginY.value;
      const scaleX = screenW / CARD_WIDTH;
      const scaleY = screenH / CARD_HEIGHT;
      const targetScale = Math.max(scaleX, scaleY);

      // During COLLAPSING with pan, add pull-down drag
      const dismissDrag = state === FULL_SCREEN ? pullY.value * 0.5 : 0;

      return {
        transform: [
          { translateX: p * targetX },
          { translateY: p * targetY + dismissDrag },
          { scale: interpolate(p, [0, 1], [1.08, targetScale]) },
        ],
        opacity: 1,
        zIndex: 100,
        borderRadius: interpolate(p, [0, 1], [12, 0]),
      };
    }

    // EXPANDING / FULL_SCREEN — other cards fade out
    if ((state === EXPANDING || state === FULL_SCREEN || state === COLLAPSING) && isOther) {
      return {
        transform: [{ translateY: 0 }, { scale: 0.95 }],
        opacity: interpolate(expandProgress.value, [0, 0.3], [0.4, 0], Extrapolation.CLAMP),
        zIndex: 0,
      };
    }

    // Default FANNED state
    return {
      transform: [{ translateY: fanLiftY }, { scale: fanScale }],
      opacity: 1,
      zIndex: 0,
    };
  });

  // ---------- Tooltip (fan browse only) ----------
  const tooltipStyle = useAnimatedStyle(() => {
    if (interactionState.value !== FANNED) return { opacity: 0 };
    const focusedIndex = Math.min(
  Math.max(Math.floor((dragX.value / DRAG_PER_CARD) + 0.45), 0),
  NUM_CARDS - 1,
);
    const isFocused = focusedIndex === cardIndex ? 1 : 0;
    return { opacity: isUnlocked.value * isFocused };
  });

  return (
    <Animated.View
      ref={cardRef}
      style={[
        {
          position: 'absolute',
          top: baseTop,
          left: baseLeft,
          shadowColor: '#6c6c6c',
          shadowOffset: { width: 1, height: 3 },
          shadowRadius: 5,
          shadowOpacity: 0.25,
          elevation: 1,
          backgroundColor: 'transparent',
        },
        animStyle,
      ]}
    >
      <Animated.View style={[styles.tooltip, tooltipStyle]}>
        <Text style={styles.tooltipText}>{recipeName}</Text>
      </Animated.View>
      <View style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
        <RecipeCard width={CARD_WIDTH} height={CARD_HEIGHT} />
        <Text style={styles.cardLabel}>{recipeName}</Text>
      </View>
    </Animated.View>
  );
}

// ---------- Box overlay fade (dims box layers during expand) ----------
function BoxFade({ expandProgress, interactionState }: {
  expandProgress: SharedValue<number>;
  interactionState: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const active = interactionState.value >= EXPANDING ? 1 : 0;
    return {
      opacity: active * interpolate(expandProgress.value, [0, 0.3], [0, 0.8], Extrapolation.CLAMP),
    };
  });
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: '#F7F0E6', zIndex: 50 }, style]}
      pointerEvents="none"
    />
  );
}

// ---------- HomeScreen ----------
export default function HomeScreen() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [detailCard, setDetailCard] = useState<number | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [recipeInput, setRecipeInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fontsLoaded] = useFonts({ Grandstander_400Regular });

  // Fan browse shared values (unchanged)
  const isUnlocked = useSharedValue(0);
  const dragX = useSharedValue(0);

  // Interaction layer shared values
  const interactionState = useSharedValue(FANNED);
  const selectedIndex = useSharedValue(-1);
  const pullY = useSharedValue(0);
  const expandProgress = useSharedValue(0);
  const cardOriginX = useSharedValue(0);
  const cardOriginY = useSharedValue(0);
  const hapticFired = useSharedValue(0);
  const thresholdHapticFired = useSharedValue(0);

  // Refs for measuring card positions
  const wrapperRef = useAnimatedRef<Animated.View>();

  // ---------- Box fade overlay style ----------
  const boxFadeStyle = useAnimatedStyle(() => {
    const active = interactionState.value >= EXPANDING ? 1 : 0;
    return {
      opacity: active * interpolate(expandProgress.value, [0, 0.3], [0, 0.8], Extrapolation.CLAMP),
    };
  });

  // Detail view overlay style
  const detailOverlayStyle = useAnimatedStyle(() => {
    return {
      opacity: expandProgress.value,
    };
  });

  if (!fontsLoaded) return null;

  function fireSelectHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function fireLightHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function showDetail(index: number) {
    setDetailCard(index);
  }

  function hideDetail() {
    setDetailCard(null);
  }

  function dismissDetail() {
    interactionState.value = COLLAPSING;
    pullY.value = 0;
    hideDetail();
    expandProgress.value = withSpring(0, EXPAND_SPRING, (finished) => {
      if (finished) {
        interactionState.value = FANNED;
        selectedIndex.value = -1;
        hapticFired.value = 0;
        thresholdHapticFired.value = 0;
      }
    });
  }

  async function handleParseRecipe() {
    if (!recipeInput.trim()) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const cleaned = recipeInput.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{1F300}-\u{1F9FF}\u{2700}-\u{27BF}]/gu, '').trim();
      const parsed = await parseRecipeWithAI(cleaned);
      console.log('PARSED:', JSON.stringify(parsed)); 
      const newRecipe = {
        ...parsed,
        id: RECIPES.length,
      };
      RECIPES.push(newRecipe);
      setShowInput(false);
setIsParsing(false);
setRecipeInput('');
interactionState.value = EXPANDING;
expandProgress.value = withSpring(1, EXPAND_SPRING, (finished) => {
  if (finished) interactionState.value = FULL_SCREEN;
});
setDetailCard(newRecipe.id);
    } catch (e) {
      setParseError('Something went wrong — try again!');
      setIsParsing(false);
    }
  }

  async function handleCameraRoll() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      orderedSelection: true,
      quality: 0.1,
      allowsEditing: false,
      exif: false,
      base64: false,
    });

    if (result.canceled) return;

    setIsParsing(true);
    setParseError(null);
    try {
      let combinedText = '';
      for (const asset of result.assets) {
        const resized = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 800 } }],
          { compress: 0.3, format: ImageManipulator.SaveFormat.JPEG }
        );
        const formData = new FormData();
        formData.append('file', {
          uri: resized.uri,
          type: 'image/jpeg',
          name: 'recipe.jpg',
        } as any);
        formData.append('apikey', process.env.EXPO_PUBLIC_OCR_KEY ?? '');
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');

        const response = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        console.log('OCR RESULT:', JSON.stringify(data));
        if (data?.ParsedResults?.[0]?.ParsedText) {
          combinedText += data.ParsedResults[0].ParsedText + '\n';
        }
      }
      if (combinedText.trim()) {
        setRecipeInput(combinedText.trim());
      } else {
        setParseError('Could not read image — try a clearer screenshot!');
      }
    } catch (e) {
      console.log('OCR ERROR:', e);
      setParseError('Could not read image — try again!');
    } finally {
      setIsParsing(false);
    }
  }

  // ---------- Gesture: Long Press (2s) for selection ----------
  const longPress = Gesture.LongPress()
  .minDuration(LONG_PRESS_DURATION)
  .maxDistance(100)
  .onStart((e) => {
  'worklet';
  if (interactionState.value !== FANNED) return;

  // If fan is active, use the focused card from dragX
  // Otherwise default to card 0 (front card)
  const tappedIndex = isUnlocked.value > 0.5
    ? Math.min(Math.max(Math.floor((dragX.value / DRAG_PER_CARD) + 0.35), 0), NUM_CARDS - 1)
    : 0;

  selectedIndex.value = tappedIndex;
  interactionState.value = SELECTED;
  runOnJS(fireSelectHaptic)();
  const wrapperMeasure = measure(wrapperRef);
  if (wrapperMeasure) {
    cardOriginX.value = wrapperMeasure.pageX + BASE_LEFT_0 + tappedIndex * CARD_STEP;
    cardOriginY.value = wrapperMeasure.pageY + BOX_HEIGHT * 0.25 - tappedIndex * 2;
  }
})
// ← no .onEnd() at all

  // ---------- Gesture: Pan for pull-up / pull-down ----------
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      const state = interactionState.value;

      // FANNED — fan browse (existing)
      if (state === FANNED) {
        if (isUnlocked.value > 0.5) {
          dragX.value = Math.min(
            Math.max(e.translationX, 0),
            NUM_CARDS * DRAG_PER_CARD * 1.5,
          );
        }
        return;
      }

      // SELECTED — pull up to expand
      if (state === SELECTED) {
        pullY.value = Math.min(e.translationY, 0); // Only allow upward drag

        // Light haptic at threshold crossing
        if (pullY.value <= PULL_UP_THRESHOLD && thresholdHapticFired.value === 0) {
          thresholdHapticFired.value = 1;
          runOnJS(fireLightHaptic)();
        }
        if (pullY.value > PULL_UP_THRESHOLD) {
          thresholdHapticFired.value = 0;
        }
        return;
      }

      // FULL_SCREEN — pull down to dismiss
      if (state === FULL_SCREEN) {
        pullY.value = Math.max(e.translationY, 0); // Only allow downward drag
        return;
      }
    })
    .onEnd(() => {
      'worklet';
      const state = interactionState.value;

      // FANNED — snap fan browse back
      if (state === FANNED) {
        dragX.value = withSpring(0);
        isUnlocked.value = withSpring(0);
        return;
      }

      // SELECTED — check pull-up threshold
      if (state === SELECTED) {
        if (pullY.value <= PULL_UP_THRESHOLD) {
          // Commit to expand
          interactionState.value = EXPANDING;
          pullY.value = 0;
          runOnJS(showDetail)(selectedIndex.value);
          expandProgress.value = withSpring(1, EXPAND_SPRING, (finished) => {
            if (finished) {
              interactionState.value = FULL_SCREEN;
            }
          });
        } else {
          // Spring back to fan
          pullY.value = withSpring(0, SELECT_SPRING);
          interactionState.value = FANNED;
          selectedIndex.value = -1;
          hapticFired.value = 0;
          thresholdHapticFired.value = 0;
        }
        return;
      }

      // FULL_SCREEN — check pull-down threshold
      if (state === FULL_SCREEN) {
        if (pullY.value >= PULL_DOWN_THRESHOLD) {
          // Collapse back to fan
          interactionState.value = COLLAPSING;
          pullY.value = 0;
          runOnJS(hideDetail)();
          expandProgress.value = withSpring(0, EXPAND_SPRING, (finished) => {
            if (finished) {
              interactionState.value = FANNED;
              selectedIndex.value = -1;
              hapticFired.value = 0;
              thresholdHapticFired.value = 0;
            }
          });
        } else {
          // Snap back to full screen
          pullY.value = withSpring(0);
        }
        return;
      }
    });

  // Fan browse: tap-hold activates fan, finalizes on release
  const fanActivate = Gesture.Tap()
    .maxDuration(1300)
    .onBegin(() => {
      'worklet';
      if (interactionState.value === FANNED) {
        isUnlocked.value = withTiming(1, { duration: 200 });
      }
    })
    .onFinalize(() => {
      'worklet';
      if (interactionState.value === FANNED) {
        isUnlocked.value = withTiming(0, { duration: 200 });
        dragX.value = withSpring(0);
      }
    });

  const composed = Gesture.Simultaneous(longPress, fanActivate, pan);

  const recipe = RECIPES.find(r => r.id === (detailCard ?? 0)) ?? RECIPES[0];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={{
        width: '90%',
        height: 40,
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(110,61,30,0.1)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        marginTop: 8,
        marginBottom: 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="search" size={18} color="#9B7050" />
          <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 14, color: '#B7A18F', lineHeight: 40 }}>Search for a recipe</Text>
        </View>
        <Feather name="menu" size={18} color="#9B7050" />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 32, marginBottom: 12, alignSelf: 'center' }}>
        <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 24, color: '#6E3D1E' }}>Healthy Desserts</Text>
        <Feather name="edit-2" size={16} color="#6E3D1E" />
      </View>

      <GestureDetector gesture={composed}>
        <Animated.View ref={wrapperRef} style={styles.boxWrapper}>
          <BoxBack
            width={BOX_WIDTH}
            height={BOX_HEIGHT}
            style={StyleSheet.absoluteFill}
          />

          {CARD_INDICES.map((i) => (
            <AnimatedCard
              key={i}
              cardIndex={i}
              recipeName={CARD_NAMES[i]}
              isUnlocked={isUnlocked}
              dragX={dragX}
              interactionState={interactionState}
              selectedIndex={selectedIndex}
              pullY={pullY}
              expandProgress={expandProgress}
              cardOriginX={cardOriginX}
              cardOriginY={cardOriginY}
              screenW={screenW}
              screenH={screenH}
              baseTop={BOX_HEIGHT * 0.25 - i * 2}
              baseLeft={BASE_LEFT_0 + i * CARD_STEP}
            />
          ))}

          {/* Fade overlay to cover box during expand */}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.boxFade, boxFadeStyle]}
            pointerEvents="none"
          />

          <BoxFront
            width={BOX_WIDTH}
            height={BOX_HEIGHT}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </Animated.View>
      </GestureDetector>

      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 24,
        marginTop: 24,
      }}>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 32, color: '#6E3D1E', lineHeight: 32 }}>‹</Text>
          <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 16, color: '#6E3D1E' }}>Desserts</Text>
        </Pressable>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 16, color: '#6E3D1E' }}>Low oil Desi</Text>
          <Text style={{ fontSize: 32, color: '#6E3D1E', lineHeight: 32 }}>›</Text>
        </Pressable>
      </View>

      {/* Detail content overlay (swapped in via runOnJS) */}
      {detailCard !== null && (
        <Animated.View style={[styles.detailOverlay, detailOverlayStyle]}>
          {/* Close button */}
          <Pressable style={styles.closeButton} onPress={dismissDetail} hitSlop={8}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>

          <ScrollView style={[styles.detailScroll, { backgroundColor: '#F7F0E6' }]} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
            {/* Ruled lines — scrolls with content */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3000 }} pointerEvents="none">
              {Array.from({ length: 94 }, (_, i) => (
                <View key={i} style={[styles.ruledLine, { top: i * 32 }]} />
              ))}
            </View>

            <Text style={styles.detailKitchenTag}>a recipe from my kitchen</Text>
            <Text style={styles.detailTitle}>{recipe.title}</Text>
            <View style={styles.detailUnderline} />

            <View style={{ flexDirection: 'row', gap: 24, marginTop: 0 }}>
              <Text style={{ fontSize: 13, color: '#9B7050', fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>⏱ {recipe.cookTime}</Text>
              <Text style={{ fontSize: 13, color: '#9B7050', fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>🍽 {recipe.servings}</Text>
              {recipe.calories ? <Text style={{ fontSize: 13, color: '#9B7050', fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>🔥 {recipe.calories}</Text> : null}
            </View>

            {recipe.pan && (
              <>
                <Text style={{ fontSize: 13, color: '#9B7050', fontStyle: 'italic', marginTop: 8, fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>Pan</Text>
                <Text style={{ fontSize: 15, color: '#3D2000', fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>{recipe.pan}</Text>
              </>
            )}

            <Text style={styles.detailSectionHeading}>What you'll need:</Text>
            {recipe.ingredientGroups.map((grp, gi) => (
              <View key={gi}>
                <Text style={{ fontSize: 14, color: '#9B7050', fontStyle: 'italic', marginTop: 16, fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>{grp.group}</Text>
                {grp.items.map((item, ii) => (
                  <View key={ii}>
                    <Text style={{ fontSize: 15, color: '#3D2000', marginBottom: 0, fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>• {item.text}</Text>
                    {item.note && (
                      <View style={{ borderLeftWidth: 2, borderLeftColor: '#E8A090', paddingLeft: 10, marginTop: 2, marginBottom: 0 }}>
                        <Text style={{ fontSize: 13, color: '#9B7050', fontStyle: 'italic', fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>{item.note}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))}

            <Text style={styles.detailSectionHeading}>How to make it:</Text>
            {recipe.stepGroups.map((grp, gi) => (
              <View key={gi}>
                {grp.group && (
                  <Text style={{ fontSize: 14, color: '#9B7050', fontStyle: 'italic', marginTop: 16, fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>{grp.group}</Text>
                )}
                {grp.items.map((item, ii) => (
                  <Text key={ii} style={{ fontSize: 15, color: '#3D2000', marginBottom: 0, fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>
                    {'step' in item ? `${item.step}. ${item.text}` : `• ${item.text}`}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      <Pressable
        onPress={() => setShowInput(true)}
        style={{
          position: 'absolute',
          bottom: 32,
          right: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: 'rgba(255,255,255,0.7)',
          borderWidth: 1,
          borderColor: '#6E3D1E',
          borderRadius: 100,
          paddingVertical: 10,
          paddingHorizontal: 16,
          zIndex: detailCard !== null ? -1 : 300,
        }}
      >
        <Text style={{
          fontFamily: 'Grandstander_400Regular',
          fontSize: 16,
          color: '#6E3D1E',
        }}>Add new recipe</Text>
        <Text style={{
          fontSize: 16,
          color: '#6E3D1E',
        }}>+</Text>
      </Pressable>

      {showInput && (
        <Animated.View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#F7F0E6', zIndex: 400,
        }}>
          <Pressable
            onPress={() => setShowInput(false)}
            style={{
              position: 'absolute', top: 56, right: 16,
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: '#E8DDD0',
              alignItems: 'center', justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <Text style={{ fontSize: 20, color: '#2C1A0E', lineHeight: 22 }}>×</Text>
          </Pressable>
          <ScrollView
            contentContainerStyle={{ paddingTop: 80, paddingHorizontal: 24, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={{
              fontFamily: 'Grandstander_400Regular', fontSize: 32,
              color: '#9B7050', fontStyle: 'italic', lineHeight: 32,
            }}>Add a new recipe</Text>

            <View style={{ height: 2, width: '80%', backgroundColor: '#E8A090', marginBottom: 8 }} />

            <Text style={{
              fontFamily: 'Grandstander_400Regular', fontSize: 14,
              color: '#9B7050', lineHeight: 22, marginBottom: 24,
            }}>Paste messy notes, type, snap a photo or use your voice, AI will turn it into a cute recipe card </Text>

            <View style={{
              backgroundColor: '#FFFFFF', borderRadius: 16,
              padding: 16, height: 300, overflow: 'hidden',
              shadowColor: '#6c6c6c', shadowOpacity: 0.08,
              shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
            }}>
              <TextInput
                multiline
                placeholder="Paste or type your recipe here — messy notes are totally fine..."
                placeholderTextColor="#C4A882"
                value={recipeInput}
                onChangeText={setRecipeInput}
                inputAccessoryViewID="recipe-input"
                style={{
                  fontFamily: 'Grandstander_400Regular', fontSize: 15,
                  color: '#3D2000', lineHeight: 24, flex: 1,
                  textAlignVertical: 'top',
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 8 }}>
                <Feather name="maximize-2" size={18} color="#C4A882" style={{ marginRight: 'auto' }} />
                <Feather name="mic" size={20} color="#9B7050" />
                <Pressable onPress={handleCameraRoll}>
                  <Feather name="camera" size={20} color="#9B7050" />
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={handleParseRecipe}
              style={{
                marginTop: 24,
                backgroundColor: recipeInput.trim().length > 0 ? '#D4776A' : '#E8C4BC',
                borderRadius: 100,
                paddingVertical: 14,
                alignItems: 'center',
              }}>
              <Text style={{
                fontFamily: 'Grandstander_400Regular',
                fontSize: 16,
                color: '#FFFFFF',
              }}>
                {isParsing ? 'Making your card...' : 'Make my recipe card →'}
              </Text>
            </Pressable>
            {parseError && (
              <Text style={{
                fontFamily: 'Grandstander_400Regular',
                fontSize: 14,
                color: '#E8A090',
                textAlign: 'center',
                marginTop: 12,
              }}>{parseError}</Text>
            )}
          </ScrollView>
          <InputAccessoryView nativeID="recipe-input">
            <View style={{
              backgroundColor: '#F7F0E6',
              paddingHorizontal: 16,
              paddingVertical: 8,
              alignItems: 'flex-end',
              borderTopWidth: 1,
              borderTopColor: 'rgba(110,61,30,0.1)',
            }}>
              <Pressable onPress={() => Keyboard.dismiss()}>
                <Text style={{
                  fontFamily: 'Grandstander_400Regular',
                  fontSize: 16,
                  color: '#6E3D1E',
                }}>Done</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F0E6',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    color: '#2C1A0E',
    marginTop: 0,
    marginBottom: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
  },
  titleItalic: {
    fontStyle: 'italic',
    color: '#9B6240',
  },
  searchBar: {
    width: '90%',
    height: 40,
    backgroundColor: '#EDE0CC',
    borderRadius: 20,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  searchText: {
    color: '#B09070',
    fontSize: 14,
    fontStyle: 'italic',
  },
  boxWrapper: {
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    position: 'relative',
    marginTop: 0,
    marginLeft: 30,
  },
  boxFade: {
    backgroundColor: '#F7F0E6',
    zIndex: 50,
  },
  tooltip: {
    position: 'absolute',
    top: -36,
    alignSelf: 'center',
    backgroundColor: '#2C1A0E',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    zIndex: 99,
  },
  tooltipText: {
    color: '#fff',
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontSize: 12,
  },
  cardLabel: {
    position: 'absolute',
    top: 40,
    left: 6,
    width: CARD_WIDTH,
    textAlign: 'center',
    fontFamily: 'Grandstander_400Regular',
    fontSize: 12,
    color: '#6E3D1E',
    transform: [{ rotate: '12deg' }],
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 24,
  },
  navArrow: {
    fontSize: 28,
    color: '#9B6240',
  },
  navLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C1A0E',
    minWidth: 100,
    textAlign: 'center',
  },
  detailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F7F0E6',
    zIndex: 200,
  },
  ruledLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(110, 61, 30, 0.1)',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8DDD0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#2C1A0E',
    lineHeight: 22,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    paddingTop: 96,
    paddingHorizontal: 24,
    paddingBottom: 60,
  },
  detailKitchenTag: {
    fontFamily: 'Grandstander_400Regular',
    fontSize: 12,
    color: '#9B7050',
    fontStyle: 'italic',
    marginBottom: 0,
    lineHeight: 32,
  },
  detailTitle: {
    fontFamily: 'Grandstander_400Regular',
    fontSize: 32,
    color: '#2C1A0E',
    marginBottom: 0,
    lineHeight: 32,
  },
  detailUnderline: {
    height: 2,
    width: '60%',
    backgroundColor: '#E8A090',
    marginBottom: 0,
  },
  detailSectionHeading: {
    fontFamily: 'Grandstander_400Regular',
    fontSize: 24,
    color: '#2C1A0E',
    marginTop: 32,
    lineHeight: 32,
  },
  detailContentSpace: {
    height: 120,
  },
});
