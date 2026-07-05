import BoxBack from '@/assets/images/box_back.svg';
import BoxFront from '@/assets/images/box_front.svg';
import RecipeCard from '@/assets/images/recipe_card.svg';
import { Grandstander_400Regular, useFonts } from '@expo-google-fonts/grandstander';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { ArrowsOut, Camera, FilePlus, Image, List, MagnifyingGlass, Microphone, NotePencil, Package, PencilSimple, Plus, Stack, X } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, InputAccessoryView, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLLECTIONS_KEY = 'recipebox_collections';

type Collection = {
  id: number;
  name: string;
  recipes: any[];
};

const DEFAULT_COLLECTIONS: Collection[] = [
  { id: 1, name: 'My Recipes', recipes: [] },
];

async function saveCollections(collections: Collection[]) {
  await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
}

async function loadCollections(): Promise<Collection[]> {
  try {
    const stored = await AsyncStorage.getItem(COLLECTIONS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return DEFAULT_COLLECTIONS;
}

async function parseRecipeWithAI(rawText: string): Promise<any> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.EXPO_PUBLIC_GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Extract this recipe into JSON. Return ONLY raw JSON, no markdown, no explanation.\n\nSchema:\n{"title":"string","cookTime":"string","servings":"string","calories":"string","pan":null,"notes":[],"ingredientGroups":[{"group":null,"items":[{"text":"string","note":null}]}],"stepGroups":[{"group":null,"items":[{"step":1,"text":"string"}]}]}\n\nRules:\n- title: recipe name only, never usernames or engagement numbers\n- cookTime/servings/calories: empty string if not found\n- ingredientGroups/stepGroups: group is null if no subheading\n- notes: storage/serving/freezing tips only\n\nRecipe:\n${rawText}`,
      }],
    }),
  });
  const data = await response.json();
  console.log('GROQ:', JSON.stringify(data));
  if (!data.choices?.[0]?.message?.content) throw new Error(JSON.stringify(data));
  const text = data.choices[0].message.content.trim();
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ---------- Layout constants (unchanged) ----------
const { width } = Dimensions.get('window');
const BOX_WIDTH = width * 1.2;
const BOX_HEIGHT = BOX_WIDTH * (700 / 800);
const CARD_WIDTH = BOX_WIDTH * 0.58;
const CARD_HEIGHT = CARD_WIDTH * (165 / 175);

const CARD_INDICES = [8, 7, 6, 5, 4, 3, 2, 1, 0];
const NUM_CARDS = CARD_INDICES.length;
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
  previewItems?: any[];
  lineCount?: number;
  onLineCount?: (count: number) => void;
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
  previewItems,
  lineCount,
  onLineCount,
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

  const displayName = recipeName.split(' ').map((w: string) => w.length > 1 && w === w.toUpperCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');

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
      <View style={{ width: CARD_WIDTH, height: CARD_HEIGHT, overflow: 'hidden' }}>
        <RecipeCard width={CARD_WIDTH} height={CARD_HEIGHT} />
        <View style={{
  position: 'absolute',
  top: 40,
  left: CARD_WIDTH * 0.14,
  width: CARD_WIDTH * 0.72,
  alignSelf: 'center',
  alignItems: 'flex-start',
  paddingLeft: 45,
  paddingRight: 12,
  transform: [{ rotate: '12deg' }],
}}>
  <Text
    numberOfLines={3}
    onTextLayout={(e) => {
      const lines = e.nativeEvent.lines.length;
      onLineCount?.(lines);
    }}
    style={{
      fontFamily: 'Grandstander_400Regular',
      fontSize: 12,
      color: '#6E3D1E',
      textAlign: 'left',
      flexWrap: 'wrap',
    }}>
    {displayName}
  </Text>
</View>
        <View style={{
          position: 'absolute',
          top: CARD_HEIGHT * 0.25,
          left: CARD_WIDTH * 0.25,
          right: CARD_WIDTH * 0.35,
          marginTop: (lineCount ?? 1) > 1 ? 12 : 0,
          transform: [{ rotate: '12deg' }],
        }}>
          {Array.from({ length: 7 }).map((_, l) => {
            const item = (previewItems ?? [])[l];
            return (
              <Text key={l} numberOfLines={1}
                style={{ fontFamily: 'Grandstander_400Regular', fontSize: 8,
                  color: item ? 'rgba(110,61,30,0.55)' : 'transparent',
                  lineHeight: 15 }}>
                {item?.text ?? '·'}
              </Text>
            );
          })}
        </View>
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
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [recipeInput, setRecipeInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>(DEFAULT_COLLECTIONS);
  const [activeCollectionIndex, setActiveCollectionIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecipe, setEditedRecipe] = useState<any>(null);
  const [currentRecipe, setCurrentRecipe] = useState<any>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [viewMode, setViewMode] = useState<'box' | 'grid'>('box');
  const [cardLineCount, setCardLineCount] = useState<Record<number, number>>({});
  const boxNameInputRef = useRef<TextInput>(null);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [fontsLoaded] = useFonts({ Grandstander_400Regular });

  const activeCollection = collections[activeCollectionIndex];
  const recipes = activeCollection?.recipes ?? [];
  const totalCards = recipes.length;
  const BASE_LEFT_0 = BOX_WIDTH * (totalCards <= 1 ? 0.20 : totalCards <= 3 ? 0.19 : 0.18);
  const boxName = activeCollection?.name ?? 'My Recipes';
  const prevCollection = collections[activeCollectionIndex - 1];
  const nextCollection = collections[activeCollectionIndex + 1];

  const allRecipes = collections.flatMap(c =>
    c.recipes.map((r: any) => ({ ...r, collectionName: c.name }))
  );

  const searchResults = searchQuery.trim().length === 0 ? [] :
    (() => {
      const q = searchQuery.trim().toLowerCase();
      const exact = allRecipes.filter(r => r.title.toLowerCase().includes(q));
      if (exact.length >= 5) return exact.slice(0, 5);
      const fuzzy = allRecipes.filter(r =>
        !r.title.toLowerCase().includes(q) &&
        q.split('').every((ch: string) => r.title.toLowerCase().includes(ch))
      );
      return [...exact, ...fuzzy].slice(0, 5);
    })();

  useEffect(() => {
    fabProgress.value = withTiming(isFabOpen ? 1 : 0, { duration: 220 });
  }, [isFabOpen]);

  useEffect(() => {
    if (recordingState === 'recording') {
      pulseScale.value = withRepeat(withTiming(1.3, { duration: 800 }), -1, true);
    } else {
      pulseScale.value = 1;
    }
  }, [recordingState]);

  useEffect(() => {
    (async () => {
      await AsyncStorage.removeItem('recipebox_recipes');
      await AsyncStorage.removeItem('recipebox_box_name');
      const loaded = await loadCollections();
      setCollections(loaded);
      setActiveCollectionIndex(0);
    })();
  }, []);

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
  const slideX = useSharedValue(0);
  const fabProgress = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  // Refs for measuring card positions
  const wrapperRef = useAnimatedRef<Animated.View>();

  const boxSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: interpolate(pulseScale.value, [1, 1.3], [0.6, 0]),
  }));

  const fabIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(fabProgress.value, [0, 1], [0, 45])}deg` }],
  }));

  const button1Style = useAnimatedStyle(() => ({
    opacity: fabProgress.value,
    transform: [{ translateY: interpolate(fabProgress.value, [0, 1], [20, 0]) }],
  }));

  const button2Style = useAnimatedStyle(() => ({
    opacity: interpolate(fabProgress.value, [0, 0.3, 1], [0, 0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(fabProgress.value, [0, 1], [30, 0]) }],
  }));

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

  function saveBoxName(name: string) {
    const updated = collections.map((c, i) =>
      i === activeCollectionIndex ? { ...c, name } : c
    );
    setCollections(updated);
    saveCollections(updated);
  }

  function fireSelectHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function fireLightHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function showDetail(index: number) {
    const r = [...recipes].reverse()[index];
    if (r) {
      setDetailCard(r.id);
      setCurrentRecipe(r);
    }
  }

  function hideDetail() {
    setDetailCard(null);
  }

  function dismissDetail() {
    interactionState.value = COLLAPSING;
    pullY.value = 0;
    hideDetail();
    setCurrentRecipe(null);
    setIsEditing(false);
    setEditedRecipe(null);
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
      const cleaned = recipeInput.trim();
      const parsed = await parseRecipeWithAI(cleaned);
      console.log('PARSED:', JSON.stringify(parsed)); 
      const newId = Date.now();
      const newRecipe = {
        ...parsed,
        id: newId,
      };
      const updatedRecipes = [...recipes, newRecipe];
      updateActiveRecipes(updatedRecipes);
      setShowInput(false);
      setIsParsing(false);
      setRecipeInput('');
      setIsEditing(true);
      setEditedRecipe(newRecipe);
      setDetailCard(newId);
      interactionState.value = EXPANDING;
      expandProgress.value = withSpring(1, EXPAND_SPRING, (finished) => {
        if (finished) interactionState.value = FULL_SCREEN;
      });
    } catch (e) {
      setParseError('Error: ' + String(e));
      setIsParsing(false);
    }
  }

  async function ocrImage(uri: string): Promise<string | null> {
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.3, format: ImageManipulator.SaveFormat.JPEG }
    );
    const formData = new FormData();
    formData.append('file', { uri: resized.uri, type: 'image/jpeg', name: 'recipe.jpg' } as any);
    formData.append('apikey', process.env.EXPO_PUBLIC_OCR_KEY ?? '');
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    const response = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
    const data = await response.json();
    return data?.ParsedResults?.[0]?.ParsedText ?? null;
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
        const text = await ocrImage(asset.uri);
        if (text) combinedText += text + '\n';
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

  async function startRecording() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    setRecordingDuration(0);
    setRecordingState('recording');
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration(d => d + 1);
    }, 1000);
  }

  async function stopRecordingAndTranscribe() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordingState('transcribing');
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    if (!uri) {
      setRecordingState('idle');
      setParseError('Recording failed — try again!');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
      formData.append('model', 'whisper-large-v3-turbo');
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.EXPO_PUBLIC_GROQ_KEY}` },
        body: formData,
      });
      const data = await response.json();
      console.log('WHISPER:', JSON.stringify(data));
      if (data?.text?.trim()) {
        setRecipeInput(data.text.trim());
        setShowInput(true);
      } else {
        setParseError('Could not transcribe — try again!');
      }
    } catch (e) {
      console.log('TRANSCRIBE ERROR:', e);
      setParseError('Could not transcribe — try again!');
    } finally {
      setRecordingState('idle');
    }
  }

  function cancelRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    audioRecorder.stop();
    setRecordingState('idle');
  }

  async function handleCameraCapture() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.1, allowsEditing: false, exif: false, base64: false,
    });
    if (result.canceled) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const text = await ocrImage(result.assets[0].uri);
      if (text?.trim()) {
        setRecipeInput(text.trim());
      } else {
        setParseError('Could not read image — try a clearer photo!');
      }
    } catch (e) {
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

  const recipe = editedRecipe ?? currentRecipe ?? recipes.find(r => r.id === detailCard) ?? null;

  function startEditing() {
    setEditedRecipe(JSON.parse(JSON.stringify(recipe)));
    setIsEditing(true);
  }

  function saveEditedRecipe() {
    const updatedRecipes = recipes.map(r =>
      r.id === editedRecipe.id ? editedRecipe : r
    );
    updateActiveRecipes(updatedRecipes);
    setIsEditing(false);
    setEditedRecipe(null);
  }

  function updateActiveRecipes(updatedRecipes: any[]) {
    const updated = collections.map((c, i) =>
      i === activeCollectionIndex ? { ...c, recipes: updatedRecipes } : c
    );
    setCollections(updated);
    saveCollections(updated);
  }

  function discardEdits() {
    setIsEditing(false);
    setEditedRecipe(null);
  }

  function formatDuration(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function goToCollection(direction: 'next' | 'prev') {
    const newIndex = activeCollectionIndex + (direction === 'next' ? 1 : -1);
    if (newIndex < 0 || newIndex >= collections.length) return;
    const screenW = Dimensions.get('window').width;
    const exitX = direction === 'next' ? -screenW : screenW;
    const enterX = direction === 'next' ? screenW : -screenW;
    slideX.value = withTiming(exitX, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setActiveCollectionIndex)(newIndex);
        slideX.value = enterX;
        slideX.value = withSpring(0, EXPAND_SPRING);
      }
    });
  }

  function createNewCollection() {
    const newCollection = { id: Date.now(), name: 'New Collection', recipes: [] };
    const updated = [...collections, newCollection];
    setCollections(updated);
    saveCollections(updated);
    setActiveCollectionIndex(updated.length - 1);
    setIsFabOpen(false);
    setTimeout(() => {
      setIsEditingName(true);
      setTimeout(() => boxNameInputRef.current?.focus(), 50);
    }, 300);
  }

  function HighlightedTitle({ title, query }: { title: string; query: string }) {
    if (!query.trim()) return <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#3D2000', lineHeight: 16 }}>{title}</Text>;
    const q = query.trim();
    const idx = title.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#3D2000', lineHeight: 16 }}>{title}</Text>;
    return (
      <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#3D2000', lineHeight: 16 }}>
        {title.slice(0, idx)}
        <Text style={{ backgroundColor: '#E8A090', color: '#6E3D1E' }}>{title.slice(idx, idx + q.length)}</Text>
        {title.slice(idx + q.length)}
      </Text>
    );
  }

  function openRecipeFromGrid(r: any) {
    setDetailCard(r.id);
    setCurrentRecipe(r);
    interactionState.value = EXPANDING;
    expandProgress.value = withSpring(1, EXPAND_SPRING, (finished) => {
      if (finished) interactionState.value = FULL_SCREEN;
    });
  }

  const CARD_REST_TOP = BOX_HEIGHT * 0.22;
  const STACK_RISE = 3;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={{
        width: '90%', height: 40,
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 100,
        borderWidth: isSearchActive ? 1.5 : 1,
        borderColor: isSearchActive ? '#E8A090' : 'rgba(110,61,30,0.1)',
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12, marginTop: 8, marginBottom: 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <MagnifyingGlass weight="regular" size={18} color="#9B7050" />
          {isSearchActive ? (
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search for a recipe"
              placeholderTextColor="#B7A18F"
              style={{ fontFamily: 'Grandstander_400Regular', fontSize: 14, color: '#2C1A0E', flex: 1 }}
              autoFocus
              returnKeyType="search"
              onBlur={() => { if (!searchQuery.trim()) { setIsSearchActive(false); } }}
            />
          ) : (
            <Pressable onPress={() => setIsSearchActive(true)} style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 14, color: '#B7A18F' }}>Search for a recipe</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => { setIsSearchActive(false); setSearchQuery(''); Keyboard.dismiss(); }}>
          {isSearchActive
            ? <X weight="regular" size={18} color="#9B7050" />
            : <List weight="regular" size={18} color="#9B7050" />}
        </Pressable>
      </View>

      {isSearchActive && (
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {searchResults.length > 0 ? (
            <>
              <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#9B7050', marginBottom: 12 }}>
                Search results • {searchResults.length}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {searchResults.map((r: any) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => { setIsSearchActive(false); setSearchQuery(''); openRecipeFromGrid(r); }}
                    activeOpacity={0.8}
                    style={{ width: (width - 44) / 2, backgroundColor: '#FFF8F0', borderRadius: 12, padding: 12, shadowColor: '#6c6c6c', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
                  >
                    <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 9, color: '#9B7050', marginBottom: 4 }}>{r.collectionName}</Text>
                    <HighlightedTitle title={r.title} query={searchQuery} />
                    {(r.ingredientGroups?.flatMap((g: any) => g.items) ?? []).slice(0, 5).map((item: any, l: number) => (
                      <Text key={l} numberOfLines={1}
                        style={{ fontFamily: 'Grandstander_400Regular', fontSize: 8, color: 'rgba(110,61,30,0.55)', lineHeight: 14, marginTop: 2 }}>
                        {item.text}
                      </Text>
                    ))}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : searchQuery.trim().length > 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
              <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 16, color: '#9B7050', marginBottom: 20 }}>No recipes found</Text>
              <Pressable
                onPress={() => {
                  setIsSearchActive(false);
                  setRecipeInput(searchQuery);
                  setSearchQuery('');
                  setShowInput(true);
                }}
                style={{ backgroundColor: '#D4776A', borderRadius: 100, paddingVertical: 12, paddingHorizontal: 24 }}>
                <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 15, color: '#fff' }}>+ Add "{searchQuery}" as new recipe</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}

      {!isSearchActive && (<>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 32, marginBottom: 12, paddingHorizontal: 24, width: '100%' }}>
      <TouchableOpacity onPress={() => { setIsEditingName(true); setTimeout(() => boxNameInputRef.current?.focus(), 50); }} activeOpacity={0.7}>
        {isEditingName ? (
          <TextInput
            ref={boxNameInputRef}
            value={boxName}
            onChangeText={(t) => {
              const updated = collections.map((c, i) =>
                i === activeCollectionIndex ? { ...c, name: t } : c
              );
              setCollections(updated);
            }}
            onBlur={() => { setIsEditingName(false); saveBoxName(boxName); }}
            style={{ fontSize: 24, color: '#6E3D1E', fontFamily: 'Grandstander_400Regular', borderBottomWidth: 2, borderBottomColor: '#E8A090', minWidth: 80 }}
            inputAccessoryViewID="boxNameAccessory"
            returnKeyType="done"
            onSubmitEditing={() => { setIsEditingName(false); saveBoxName(boxName); }}
          />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 24, color: '#6E3D1E', fontFamily: 'Grandstander_400Regular' }}>{boxName}</Text>
            <PencilSimple weight="regular" size={14} color="#9B7050" />
          </View>
        )}
      </TouchableOpacity>
        <View style={{ flexDirection: 'row', backgroundColor: '#E8DDD0', borderRadius: 100, padding: 2 }}>
          <Pressable onPress={() => setViewMode('box')} style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100, backgroundColor: viewMode === 'box' ? '#E8A090' : 'transparent' }}>
            <Package weight="regular" size={24} color={viewMode === 'box' ? '#fff' : '#9B7050'} />
            <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 9, color: viewMode === 'box' ? '#fff' : '#9B7050', marginTop: 2 }}>Box</Text>
          </Pressable>
          <Pressable onPress={() => setViewMode('grid')} style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100, backgroundColor: viewMode === 'grid' ? '#E8A090' : 'transparent' }}>
            <Stack weight="regular" size={24} color={viewMode === 'grid' ? '#fff' : '#9B7050'} />
            <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 9, color: viewMode === 'grid' ? '#fff' : '#9B7050', marginTop: 2 }}>All</Text>
          </Pressable>
        </View>
      </View>
      <InputAccessoryView nativeID="boxNameAccessory">
        <View style={{ backgroundColor: '#F7F0E6', padding: 8, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#E8DDD0' }}>
          <TouchableOpacity onPress={() => { setIsEditingName(false); saveBoxName(boxName); boxNameInputRef.current?.blur(); }}>
            <Text style={{ color: '#D4776A', fontSize: 16, fontFamily: 'Grandstander_400Regular', paddingHorizontal: 16 }}>Done</Text>
          </TouchableOpacity>
        </View>
      </InputAccessoryView>

      {viewMode === 'box' && (<>
      <GestureDetector gesture={composed}>
        <Animated.View ref={wrapperRef} style={[styles.boxWrapper, boxSlideStyle]}>
          <BoxBack
            width={BOX_WIDTH}
            height={BOX_HEIGHT}
            style={StyleSheet.absoluteFill}
          />

          {CARD_INDICES.map((i) => {
            const recipe = recipes[recipes.length - 1 - i];
            if (!recipe) return null;
            return (
              <AnimatedCard
                key={i}
                cardIndex={i}
                recipeName={[...recipes].reverse()[i]?.title ?? CARD_NAMES[i]}
                previewItems={recipes[recipes.length - 1 - i]?.ingredientGroups?.flatMap((g: any) => g.items) ?? []}
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
                baseTop={CARD_REST_TOP - i * STACK_RISE}
                baseLeft={BASE_LEFT_0 + i * CARD_STEP}
                lineCount={cardLineCount[i]}
                onLineCount={(count) => setCardLineCount(prev => ({ ...prev, [i]: count }))}
              />
            );
          })}

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
        marginTop: 0,
      }}>
        {prevCollection ? (
          <Pressable onPress={() => goToCollection('prev')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 32, color: '#6E3D1E', lineHeight: 32 }}>‹</Text>
            <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 16, color: '#6E3D1E' }}>{prevCollection.name}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {nextCollection ? (
          <Pressable onPress={() => goToCollection('next')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 16, color: '#6E3D1E' }}>{nextCollection.name}</Text>
            <Text style={{ fontSize: 32, color: '#6E3D1E', lineHeight: 32 }}>›</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>
      </>)}
      {viewMode === 'grid' && (
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {[...recipes].reverse().map((r) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => openRecipeFromGrid(r)}
              activeOpacity={0.8}
              style={{ width: (width - 44) / 2, backgroundColor: '#FFF8F0', borderRadius: 12, padding: 12, shadowColor: '#6c6c6c', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
            >
              <Text numberOfLines={2} style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#3D2000', marginBottom: 8, lineHeight: 16 }}>{r.title}</Text>
              {(r.ingredientGroups?.flatMap((g: any) => g.items) ?? []).slice(0, 7).map((item: any, l: number) => (
                <Text key={l} numberOfLines={1}
                  style={{ fontFamily: 'Grandstander_400Regular', fontSize: 8, color: 'rgba(110,61,30,0.55)', lineHeight: 14, marginBottom: 1 }}>
                  {item.text}
                </Text>
              ))}
              {(!r.ingredientGroups?.[0]?.items?.length) && [0, 1, 2, 3, 4].map(l => (
                <View key={l} style={{ height: 1, backgroundColor: '#C4B8A8', marginBottom: 10, opacity: 0.4 }} />
              ))}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      </>)}

      {/* Detail content overlay (swapped in via runOnJS) */}
      {detailCard !== null && recipe && (
        <Animated.View style={[styles.detailOverlay, detailOverlayStyle]}>
          <View style={{position:'absolute',top:0,left:0,right:0,height:88,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',paddingHorizontal:20,paddingBottom:12,backgroundColor:'#F7F0E6',zIndex:20}}>
            <Pressable onPress={dismissDetail} style={{width:36,height:36,borderRadius:18,backgroundColor:'#E8DDD0',alignItems:'center',justifyContent:'center'}}>
              <Text style={{fontSize:22,color:'#2C1A0E',lineHeight:24}}>×</Text>
            </Pressable>
            {isEditing ? (
              <Pressable onPress={saveEditedRecipe}><Text style={{fontFamily:'Grandstander_400Regular',fontSize:16,color:'#D4776A',fontWeight:'600'}}>Save</Text></Pressable>
            ) : (
              <Pressable onPress={startEditing} style={{width:36,height:36,borderRadius:18,backgroundColor:'#E8DDD0',alignItems:'center',justifyContent:'center'}}><PencilSimple weight="regular" size={16} color="#E8A090"/></Pressable>
            )}
          </View>

          <ScrollView style={[styles.detailScroll, { backgroundColor: '#F7F0E6' }]} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
            <View style={{position:'absolute',top:0,left:0,right:0,height:3000}} pointerEvents="none">
              {Array.from({length:94},(_,i)=>(
                <View key={i} style={{position:'absolute',left:0,right:0,top:i*32,height:1,backgroundColor:'rgba(110,61,30,0.1)'}}/>
              ))}
            </View>
            <Text style={styles.detailKitchenTag}>a recipe from my kitchen</Text>
            {isEditing ? (
              <TextInput
                value={editedRecipe.title}
                onChangeText={t => setEditedRecipe({...editedRecipe, title: t})}
                autoFocus={isEditing}
                style={[styles.detailTitle]}
              />
            ) : (
              <Text style={styles.detailTitle}>{recipe.title}</Text>
            )}
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
                    {isEditing ? (
                      <TextInput
                        value={'• ' + item.text}
                        onChangeText={t => {
                          const updated = JSON.parse(JSON.stringify(editedRecipe));
                          updated.ingredientGroups[gi].items[ii].text = t.startsWith('• ') ? t.slice(2) : t;
                          setEditedRecipe(updated);
                        }}
                        multiline={true}
                        style={{ fontSize: 15, color: '#3D2000',
                        fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}
                      />
                    ) : (
                      <Text style={{ fontSize: 15, color: '#3D2000', marginBottom: 0,
                      fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>
                      • {item.text}</Text>
                    )}
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
                {grp.items.map((item, ii) =>
                  isEditing ? (
                    <TextInput
                      key={ii}
                      value={'step' in item ? `${item.step}. ${item.text}` : `• ${item.text}`}
                      onChangeText={t => {
                        const updated = JSON.parse(JSON.stringify(editedRecipe));
                        const prefix = 'step' in item ? `${item.step}. ` : '• ';
                        updated.stepGroups[gi].items[ii].text = t.startsWith(prefix) ? t.slice(prefix.length) : t;
                        setEditedRecipe(updated);
                      }}
                      multiline
                      style={{ fontSize: 15, color: '#3D2000',
                      fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}
                    />
                  ) : (
                    <Text key={ii} style={{ fontSize: 15, color: '#3D2000',
                    marginBottom: 0, fontFamily: 'Grandstander_400Regular', lineHeight: 32 }}>
                      {'step' in item ? `${item.step}. ${item.text}` : `• ${item.text}`}
                    </Text>
                  )
                )}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      <View
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 32, paddingTop: 32, paddingHorizontal: 20, alignItems: 'flex-end' }}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={['rgba(247,240,230,0)', 'rgba(247,240,230,1)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 }}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <Pressable
          onPress={() => setIsFabOpen(v => !v)}
          style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: 'rgba(255,255,255,0.7)',
            borderWidth: 1, borderColor: '#6E3D1E',
            alignItems: 'center', justifyContent: 'center',
            zIndex: detailCard !== null ? -1 : (isFabOpen ? 600 : 300),
          }}>
          <Animated.View style={fabIconStyle}>
            <Plus weight="regular" size={24} color="#6E3D1E" />
          </Animated.View>
        </Pressable>
      </View>

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
                <ArrowsOut weight="regular" size={18} color="#C4A882" style={{ marginRight: 'auto' }} />
                <Microphone weight="regular" size={20} color="#9B7050" />
                <Pressable onPress={handleCameraRoll}>
                  <Camera weight="regular" size={20} color="#9B7050" />
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

      {isFabOpen && (
        <Pressable
          onPress={() => setIsFabOpen(false)}
          style={[StyleSheet.absoluteFill, { zIndex: 500 }]}>
          <BlurView
            intensity={30}
            tint="light"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(44,26,14,0.15)' }]}>
            <View style={{
              position: 'absolute',
              bottom: 120,
              right: 20,
              alignItems: 'flex-end',
              gap: 12,
            }}>
              <Animated.View style={button1Style}>
                <Pressable
                  onPress={() => { setIsFabOpen(false); setShowImportSheet(true); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: '#fff', borderRadius: 100,
                    paddingVertical: 16, paddingHorizontal: 28,
                    shadowColor: '#6c6c6c', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
                  }}>
                  <FilePlus weight="regular" size={20} color="#6E3D1E" />
                  <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 17, color: '#6E3D1E' }}>Add new recipe</Text>
                </Pressable>
              </Animated.View>
              <Animated.View style={button2Style}>
                <Pressable
                  onPress={createNewCollection}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: '#fff', borderRadius: 100,
                    paddingVertical: 16, paddingHorizontal: 28,
                    shadowColor: '#6c6c6c', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
                  }}>
                  <Package weight="regular" size={20} color="#6E3D1E" />
                  <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 17, color: '#6E3D1E' }}>Add new recipe box</Text>
                </Pressable>
              </Animated.View>
            </View>
          </BlurView>
        </Pressable>
      )}

      {showImportSheet && (
        <Pressable onPress={() => setShowImportSheet(false)} style={[StyleSheet.absoluteFill, { zIndex: 550, justifyContent: 'flex-end' }]}>
          <BlurView intensity={30} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(44,26,14,0.15)', justifyContent: 'flex-end' }]}>
            <Pressable style={{ backgroundColor: '#F7F0E6', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 }}>
              <View style={{ width: 36, height: 4, backgroundColor: '#D4C4B0', borderRadius: 100, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 18, color: '#6E3D1E', textAlign: 'center', marginBottom: 20 }}>How would you like to add new recipe?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
                <Pressable onPress={() => { setShowImportSheet(false); setShowInput(true); handleCameraRoll(); }} style={{ width: '47%', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 20, alignItems: 'center', gap: 8, borderWidth: 0.5, borderColor: '#E8DDD0' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 100, backgroundColor: '#E8DDD0', alignItems: 'center', justifyContent: 'center' }}>
                    <Image weight="regular" size={20} color="#6E3D1E" />
                  </View>
                  <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#6E3D1E' }}>From gallery</Text>
                </Pressable>
                <Pressable onPress={() => { setShowImportSheet(false); setShowInput(true); handleCameraCapture(); }} style={{ width: '47%', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 20, alignItems: 'center', gap: 8, borderWidth: 0.5, borderColor: '#E8DDD0' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 100, backgroundColor: '#E8DDD0', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera weight="regular" size={20} color="#6E3D1E" />
                  </View>
                  <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#6E3D1E' }}>Take a photo</Text>
                </Pressable>
                <Pressable onPress={() => { setShowImportSheet(false); setShowInput(true); }} style={{ width: '47%', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 20, alignItems: 'center', gap: 8, borderWidth: 0.5, borderColor: '#E8DDD0' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 100, backgroundColor: '#E8DDD0', alignItems: 'center', justifyContent: 'center' }}>
                    <NotePencil weight="regular" size={20} color="#6E3D1E" />
                  </View>
                  <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#6E3D1E' }}>Type it out</Text>
                </Pressable>
                <Pressable onPress={() => { setShowImportSheet(false); startRecording(); }} style={{ width: '47%', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 20, alignItems: 'center', gap: 8, borderWidth: 0.5, borderColor: '#E8DDD0' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 100, backgroundColor: '#E8DDD0', alignItems: 'center', justifyContent: 'center' }}>
                    <Microphone weight="regular" size={20} color="#6E3D1E" />
                  </View>
                  <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 13, color: '#6E3D1E' }}>Record voice</Text>
                </Pressable>
              </View>
            </Pressable>
          </BlurView>
        </Pressable>
      )}

      {recordingState !== 'idle' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F7F0E6', zIndex: 700, alignItems: 'center', justifyContent: 'center', gap: 20 }]}>
          {recordingState === 'recording' && (
            <>
              <Pressable onPress={stopRecordingAndTranscribe} style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#D4776A', alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View style={[pulseStyle, { position: 'absolute', width: 104, height: 104, borderRadius: 52, borderWidth: 2, borderColor: '#E8A090' }]} />
                <Microphone weight="regular" size={32} color="#fff" />
              </Pressable>
              <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 24, color: '#6E3D1E' }}>{formatDuration(recordingDuration)}</Text>
              <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 14, color: '#9B7050', fontStyle: 'italic' }}>Speak your recipe... tap to stop</Text>
              <Pressable onPress={cancelRecording} style={{ marginTop: 12 }}>
                <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 15, color: '#9B7050' }}>Cancel</Text>
              </Pressable>
            </>
          )}
          {recordingState === 'transcribing' && (
            <>
              <ActivityIndicator size="large" color="#D4776A" />
              <Text style={{ fontFamily: 'Grandstander_400Regular', fontSize: 14, color: '#9B7050', fontStyle: 'italic' }}>Transcribing your recipe...</Text>
            </>
          )}
        </View>
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
    left: CARD_WIDTH * 0.1,
    right: CARD_WIDTH * 0.1,
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
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F7F0E6',
    zIndex: 200,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    paddingTop: 108,
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
