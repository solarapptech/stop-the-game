import { DefaultTheme } from 'react-native-paper';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#4CAF50',
    accent: '#FF9800',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    text: '#212121',
    error: '#F44336',
    success: '#4CAF50',
    warning: '#FFC107',
    info: '#2196F3',
    disabled: '#BDBDBD',
    placeholder: '#9E9E9E',
    backdrop: 'rgba(0, 0, 0, 0.5)',
  },
  // Use DefaultTheme fonts so valid font variants (regular, medium, light,
  // thin) are present. This avoids referencing local Roboto font files while
  // keeping react-native-paper typography functional.
  fonts: {
    ...DefaultTheme.fonts,
  },
  roundness: 8,
};

export default theme;
