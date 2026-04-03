import BoxBack from '@/assets/images/box_back.svg';
import BoxFront from '@/assets/images/box_front.svg';
import RecipeCard from '@/assets/images/receipe_card.svg';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const BOX_WIDTH = width * 1.2;
const BOX_HEIGHT = BOX_WIDTH * (700 / 800);
const CARD_WIDTH = BOX_WIDTH * 0.58;
const CARD_HEIGHT = CARD_WIDTH * (165 / 175);

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>
        The <Text style={styles.titleItalic}>Recipe Box</Text>
      </Text>

      <View style={styles.searchBar}>
        <Text style={styles.searchText}>Search for a recipe...</Text>
      </View>

      <View style={styles.boxWrapper}>
        <BoxBack
          width={BOX_WIDTH}
          height={BOX_HEIGHT}
          style={StyleSheet.absoluteFill}
        />

        {[4, 3, 2, 1, 0].map((i) => (
          <RecipeCard
            key={i}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            style={{
              position: 'absolute',
              top: BOX_HEIGHT * 0.22 + i * 8,
              left: BOX_WIDTH * 0.12 + i * 6,
            }}
          />
        ))}

        <BoxFront
          width={BOX_WIDTH}
          height={BOX_HEIGHT}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={styles.nav}>
        <Text style={styles.navArrow}>‹</Text>
        <Text style={styles.navLabel}>Desi Food</Text>
        <Text style={styles.navArrow}>›</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F0E6',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    color: '#2C1A0E',
    marginTop: 16,
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
    marginTop: 20,
    marginLeft: 30,
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
});