/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Paleta v2 — SED-360
        tup: {
          DEFAULT: '#1e3a5f',
          50: '#e8edf5',
          100: '#d1dbeb',
          200: '#a3b7d7',
          300: '#7593c3',
          400: '#476faf',
          500: '#1e3a5f',
          600: '#182e4c',
          700: '#122339',
          800: '#0c1726',
          900: '#060c13',
        },
        dorado: {
          DEFAULT: '#e8a020',
          50: '#fef9ee',
          100: '#fdf0ce',
          200: '#fae29d',
          300: '#f6cd6b',
          400: '#f2b83a',
          500: '#e8a020',
          600: '#c78716',
          700: '#9e6715',
          800: '#7d5218',
          900: '#66441a',
        },
        // Categorías de evaluación
        sobresaliente: '#22c55e',
        distinguido: '#3b82f6',
        bueno: '#a855f7',
        aprobado: '#f59e0b',
        a_mejorar: '#f97316',
        insuficiente: '#ef4444',
        // Alertas de comentarios
        'foco-rojo': '#dc2626',
        'critico-com': '#f97316',
        'a-mejorar-com': '#f59e0b',
        'neutro-com': '#6b7280',
        'excelente-com': '#22c55e',
      },
      backgroundImage: {
        'fondo-dashboard': 'linear-gradient(135deg, #f5f7fa 0%, #eef2f7 50%, #f0f4ff 100%)',
        'hero-tup': 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%)',
      },
      boxShadow: {
        tarjeta: '0 4px 6px -1px rgba(30, 58, 95, 0.08), 0 2px 4px -2px rgba(30, 58, 95, 0.05)',
        'tarjeta-hover': '0 10px 15px -3px rgba(30, 58, 95, 0.12), 0 4px 6px -4px rgba(30, 58, 95, 0.08)',
        modal: '0 20px 25px -5px rgba(30, 58, 95, 0.15), 0 8px 10px -6px rgba(30, 58, 95, 0.10)',
      },
      borderRadius: { '4xl': '2rem' },
      animation: {
        'flotar-entrada': 'flotarEntrada 0.5s ease-out forwards',
        'pulso-suave': 'pulsoSuave 2s ease-in-out infinite',
      },
      keyframes: {
        flotarEntrada: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulsoSuave: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
