/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Paleta Institucional TecNM
        institucional: {
          DEFAULT: '#1B396A',
          50: '#E8EDF5',
          100: '#D1DBEB',
          200: '#A3B7D7',
          300: '#7593C3',
          400: '#476FAF',
          500: '#1B396A',
          600: '#162E55',
          700: '#102240',
          800: '#0B172B',
          900: '#050B15',
          950: '#03070D',
        },
        // Acento de Acción (Azul brillante)
        accion: {
          DEFAULT: '#2563EB',
          50: '#EFF4FF',
          100: '#DBE9FE',
          200: '#BFD3FE',
          300: '#93B4FD',
          400: '#6091FA',
          500: '#3B72F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
      },
      backgroundImage: {
        // Gradiente de fondo institucional
        'fondo-dashboard':
          'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 50%, #F0F9FF 100%)',
        // Gradiente para hero sections
        'hero-institucional':
          'linear-gradient(135deg, #1B396A 0%, #2563EB 100%)',
        // Gradiente para tarjetas de bienvenida
        'tarjeta-bienvenida':
          'linear-gradient(135deg, #1B396A 0%, #1E40AF 100%)',
      },
      boxShadow: {
        // Sombras para tarjetas flotantes (efecto elevación)
        tarjeta: '0 4px 6px -1px rgba(27, 57, 106, 0.08), 0 2px 4px -2px rgba(27, 57, 106, 0.05)',
        'tarjeta-hover':
          '0 10px 15px -3px rgba(27, 57, 106, 0.12), 0 4px 6px -4px rgba(27, 57, 106, 0.08)',
        // Sombra para modales con glassmorphism
        modal:
          '0 20px 25px -5px rgba(27, 57, 106, 0.15), 0 8px 10px -6px rgba(27, 57, 106, 0.10)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
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
