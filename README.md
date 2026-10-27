RecipeBox

A digital version of a grandmother's wooden recipe card index box. Warm, tactile and nostalgic. Flip through a fanned stack of recipe cards, pull one out to read it, and add new recipes by photo, voice or typing.

Built with React Native and Expo, and runs in Expo Go (no custom dev build needed).

Features
Recipe card box: a stack of up to 9 cards in a wooden box. Long-press to fan the cards, drag to browse, and tap to pull one out into a full-screen ruled recipe card.
Multiple recipe boxes: organise recipes into collections (e.g. "My Recipes", "Holiday Baking"). Rename a box inline and swipe between boxes with the collection arrows.
Box / All view: switch between the 3D card box and a two-column grid of mini recipe cards.
Add recipes four ways (from the + button):
From gallery (multi-image, with OCR)
Take a photo (with OCR)
Type it out
Record your voice (speech-to-text)
AI recipe parsing: messy text becomes a clean card with title, cook time, servings, calories, pan size, notes, grouped ingredients and grouped steps.
Edit mode: every field on a recipe card is editable in place.
Local-first: everything is stored on your device with AsyncStorage. No account, no backend.
Design
Token	Color
Background	
#F7F0E6
Dark	
#2C1A0E
Brown	
#6E3D1E
Mid	
#9B7050
Coral	
#E8A090
Coral (active)	
#D4776A
Cream	
#E8DDD0

Font: Grandstander (400) throughout. Icons: Phosphor.

Tech stack
React Native + Expo (Expo Go)
React Native Reanimated + Gesture Handler
react-native-svg + SVG transformer
@expo-google-fonts/grandstander
phosphor-react-native
expo-blur, expo-linear-gradient
expo-image-picker, expo-image-manipulator
expo-audio
@react-native-async-storage/async-storage

External services:

OCR: OCR.space
Speech-to-text: Groq Whisper (whisper-large-v3-turbo)
Recipe parsing: Groq (meta-llama/llama-4-scout-17b-16e-instruct)
