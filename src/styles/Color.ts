// Should match tailwind.config.js
export enum Color {
  Black = '#010101',
  White = '#FFFFFF',
  Gray = '#6B7280',
  Blue = '#2362C1',
  Pink = '#D631B9',
  Beige = '#F1EDE9',
  Red = '#BF1B15',
}

// Useful for cases when using class names isn't convenient
// such as in svg fills
export function classNameToColor(className) {
  switch (className) {
    case 'bg-blue-500':
      return Color.Blue;
    case 'bg-pink-500':
      return Color.Pink;
    case 'bg-red-500':
      return Color.Red;
    case 'bg-gray-500':
      return Color.Gray;
    default:
      throw new Error('Missing color for className: ' + className);
  }
}
