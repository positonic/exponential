import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Create Mantine color tuples for brand colors
const brandColors: MantineColorsTuple = [
  '#e6f7ff', // 0 - lightest
  '#bae7ff',
  '#91d5ff',
  '#69c0ff',
  '#40a9ff',
  '#1890ff', // 5 - main
  '#096dd9',
  '#0050b3',
  '#003a8c',
  '#002766', // 9 - darkest
];

// Component styles that apply to both light and dark themes
const componentStyles = {
  // Paper component (used by Modal, Popover, etc.)
  Paper: {
    defaultProps: {
      style: {
        backgroundColor: 'var(--color-bg-elevated)',
        color: 'var(--color-text-primary)',
        borderColor: 'var(--color-border-primary)',
      },
    },
  },
  
  // Modal specific styles
  Modal: {
    defaultProps: {
      styles: {
        content: {
          backgroundColor: 'var(--color-bg-elevated)',
        },
        header: {
          backgroundColor: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border-primary)',
        },
        title: {
          color: 'var(--color-text-primary)',
        },
        close: {
          color: 'var(--color-text-secondary)',
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)',
          },
        },
        overlay: {
          backgroundColor: 'var(--color-bg-overlay)',
        },
      },
    },
  },
  
  // Popover styles
  Popover: {
    defaultProps: {
      styles: {
        dropdown: {
          backgroundColor: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-primary)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        },
      },
    },
  },
  
  // Select component
  Select: {
    defaultProps: {
      styles: {
        input: {
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border-primary)',
          '&:focus': {
            borderColor: 'var(--color-border-focus)',
          },
          '&::placeholder': {
            color: 'var(--color-text-muted)',
          },
        },
        dropdown: {
          backgroundColor: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-primary)',
        },
        item: {
          color: 'var(--color-text-primary)',
          '&[data-selected]': {
            backgroundColor: 'var(--color-brand-primary)',
            color: 'var(--color-text-inverse)',
          },
          '&[data-hovered]': {
            backgroundColor: 'var(--color-surface-hover)',
          },
        },
        label: {
          color: 'var(--color-text-primary)',
        },
      },
    },
  },
  
  // TextInput and Textarea
  TextInput: {
    defaultProps: {
      styles: {
        input: {
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border-primary)',
          '&:focus': {
            borderColor: 'var(--color-border-focus)',
          },
          '&::placeholder': {
            color: 'var(--color-text-muted)',
          },
        },
        label: {
          color: 'var(--color-text-primary)',
        },
      },
    },
  },
  
  Textarea: {
    defaultProps: {
      styles: {
        input: {
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border-primary)',
          '&:focus': {
            borderColor: 'var(--color-border-focus)',
          },
          '&::placeholder': {
            color: 'var(--color-text-muted)',
          },
        },
        label: {
          color: 'var(--color-text-primary)',
        },
      },
    },
  },
  
  // Button component
  Button: {
    defaultProps: {
      styles: {
        root: {
          '&[data-variant="filled"]': {
            backgroundColor: 'var(--color-brand-primary)',
            color: 'var(--color-text-inverse)',
            '&:hover': {
              backgroundColor: 'var(--color-brand-primary-hover)',
            },
          },
          '&[data-variant="subtle"]': {
            color: 'var(--color-text-secondary)',
            '&:hover': {
              backgroundColor: 'var(--color-surface-hover)',
            },
          },
          '&[data-variant="default"]': {
            backgroundColor: 'var(--color-surface-secondary)',
            color: 'var(--color-text-primary)',
            borderColor: 'var(--color-border-primary)',
            '&:hover': {
              backgroundColor: 'var(--color-surface-hover)',
            },
          },
        },
      },
    },
  },
  
  // DateInput and DatePicker components
  DateInput: {
    defaultProps: {
      popoverProps: {
        styles: {
          dropdown: {
            backgroundColor: 'var(--color-bg-elevated)',
            borderColor: 'var(--color-border-primary)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          },
        },
      },
      styles: {
        input: {
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border-primary)',
          '&:focus': {
            borderColor: 'var(--color-border-focus)',
          },
          '&::placeholder': {
            color: 'var(--color-text-muted)',
          },
        },
        label: {
          color: 'var(--color-text-primary)',
        },
        calendar: {
          backgroundColor: 'var(--color-bg-primary)',
        },
        calendarHeader: {
          backgroundColor: 'var(--color-bg-primary)',
          color: 'var(--color-text-primary)',
        },
        calendarHeaderControl: {
          color: 'var(--color-text-primary)',
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)',
          },
        },
        calendarHeaderLevel: {
          color: 'var(--color-text-primary)',
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)',
          },
        },
        month: {
          backgroundColor: 'var(--color-bg-primary)',
        },
        monthsList: {
          backgroundColor: 'var(--color-bg-primary)',
        },
        monthsListCell: {
          color: 'var(--color-text-primary)',
          border: '1px solid transparent',
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)',
          },
          '&[data-selected]': {
            backgroundColor: 'var(--color-brand-primary)',
            color: 'var(--color-text-inverse)',
          },
        },
        yearsList: {
          backgroundColor: 'var(--color-bg-primary)',
        },
        yearsListCell: {
          color: 'var(--color-text-primary)',
          border: '1px solid transparent',
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)',
          },
          '&[data-selected]': {
            backgroundColor: 'var(--color-brand-primary)',
            color: 'var(--color-text-inverse)',
          },
        },
        weekday: {
          color: 'var(--color-text-muted)',
        },
        day: {
          color: 'var(--color-text-primary)',
          backgroundColor: 'transparent',
          border: '1px solid transparent',
          '&[data-selected]': {
            backgroundColor: 'var(--color-brand-primary)',
            color: 'var(--color-text-inverse)',
          },
          '&[data-in-range]': {
            backgroundColor: 'var(--color-brand-primary)',
            opacity: 0.2,
          },
          '&[data-outside]': {
            color: 'var(--color-text-disabled)',
          },
          '&[data-today]': {
            backgroundColor: 'var(--color-brand-success)',
            color: 'var(--color-text-inverse)',
            fontWeight: 600,
          },
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)',
          },
        },
      },
    },
  },
  
  DatePicker: {
    styles: {
      calendar: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      calendarHeader: {
        backgroundColor: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
      },
      calendarHeaderControl: {
        color: 'var(--color-text-primary)',
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
      },
      calendarHeaderLevel: {
        color: 'var(--color-text-primary)',
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
      },
      month: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      monthsList: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      monthsListCell: {
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
        '&[data-selected]': {
          backgroundColor: 'var(--color-brand-primary)',
          color: 'var(--color-text-inverse)',
        },
      },
      yearsList: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      yearsListCell: {
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
        '&[data-selected]': {
          backgroundColor: 'var(--color-brand-primary)',
          color: 'var(--color-text-inverse)',
        },
      },
      weekday: {
        color: 'var(--color-text-muted)',
      },
      day: {
        color: 'var(--color-text-primary)',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
        '&[data-selected]': {
          backgroundColor: 'var(--color-brand-primary)',
          color: 'var(--color-text-inverse)',
        },
        '&[data-in-range]': {
          backgroundColor: 'var(--color-brand-primary)',
          opacity: 0.2,
        },
        '&[data-outside]': {
          color: 'var(--color-text-disabled)',
        },
        '&[data-today]': {
          backgroundColor: 'var(--color-brand-success)',
          color: 'var(--color-text-inverse)',
          fontWeight: 600,
        },
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
      },
    },
  },
  
  Calendar: {
    styles: {
      calendar: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      calendarHeader: {
        backgroundColor: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
      },
      calendarHeaderControl: {
        color: 'var(--color-text-primary)',
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
      },
      calendarHeaderLevel: {
        color: 'var(--color-text-primary)',
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
      },
      month: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      monthsList: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      monthsListCell: {
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
        '&[data-selected]': {
          backgroundColor: 'var(--color-brand-primary)',
          color: 'var(--color-text-inverse)',
        },
      },
      yearsList: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      yearsListCell: {
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
        '&[data-selected]': {
          backgroundColor: 'var(--color-brand-primary)',
          color: 'var(--color-text-inverse)',
        },
      },
      weekday: {
        color: 'var(--color-text-muted)',
      },
      day: {
        color: 'var(--color-text-primary)',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
        '&[data-selected]': {
          backgroundColor: 'var(--color-brand-primary)',
          color: 'var(--color-text-inverse)',
        },
        '&[data-in-range]': {
          backgroundColor: 'var(--color-brand-primary)',
          opacity: 0.2,
        },
        '&[data-outside]': {
          color: 'var(--color-text-disabled)',
        },
        '&[data-today]': {
          backgroundColor: 'var(--color-brand-success)',
          color: 'var(--color-text-inverse)',
          fontWeight: 600,
        },
        '&:hover': {
          backgroundColor: 'var(--color-surface-hover)',
        },
      },
    },
  },
  
  // Table component
  Table: {
    defaultProps: {
      style: {
        backgroundColor: 'var(--color-bg-primary)',
      },
    },
    styles: {
      root: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      table: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      thead: {
        backgroundColor: 'var(--color-bg-secondary)',
      },
      tbody: {
        backgroundColor: 'var(--color-bg-primary)',
      },
      tr: {
        borderColor: 'var(--color-border-primary)',
      },
      td: {
        borderColor: 'var(--color-border-primary)',
        color: 'var(--color-text-primary)',
      },
      th: {
        borderColor: 'var(--color-border-primary)',
        color: 'var(--color-text-primary)',
        backgroundColor: 'var(--color-bg-secondary)',
      },
    },
  },
  
  // Card component
  Card: {
    defaultProps: {
      style: {
        backgroundColor: 'var(--color-bg-elevated)',
        borderColor: 'var(--color-border-primary)',
      },
    },
  },
  
  // Tabs component
  Tabs: {
    defaultProps: {
      styles: {
        tab: {
          color: 'var(--color-text-secondary)',
          '&[data-active]': {
            borderColor: 'var(--color-brand-primary)',
            color: 'var(--color-brand-primary)',
          },
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)',
          },
        },
      },
    },
  },
};

// Create theme
export const mantineTheme = createTheme({
  colors: {
    brand: brandColors,
  },
  primaryColor: 'brand',
  primaryShade: 5,
  components: componentStyles,
  
  // Other theme settings
  respectReducedMotion: true,
  cursorType: 'pointer',
  defaultRadius: 'sm',
  focusRing: 'auto',
});