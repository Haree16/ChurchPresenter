/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // The app's own CSS and inline styles own the global look; only the utility classes are needed.
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
