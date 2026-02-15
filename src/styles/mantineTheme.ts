/* eslint-disable no-restricted-syntax */
import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Create Mantine color tuples for brand colors
const brandColors: MantineColorsTuple = [
  '#EEF3FF', // 0 - lightest
  '#D4E2FF',
  '#A8C5FF',
  '#7BA7FF',
  '#4E89FF',
  '#1F5DE0', // 5 - main
  '#1A4EC4',
  '#153FA8',
  '#10308C',
  '#0A2070', // 9 - darkest
];

// Component styles that apply to both light and dark themes
// NOTE: Mantine v7's styles prop only supports flat CSS properties (inline styles).
// CSS selectors (&:hover, &[data-*], etc.) are defined in globals.css instead.
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
        },
        overlay: {
          backgroundColor: 'var(--color-bg-overlay)',
        },
      },
    },
  },

  // Drawer specific styles
  Drawer: {
    defaultProps: {
      styles: {
        content: {
          backgroundColor: 'var(--color-bg-elevated)',
        },
        header: {
          backgroundColor: 'var(--color-bg-elevated)',
          borderBottom: '1px solid var(--color-border-primary)',
        },
        title: {
          color: 'var(--color-text-primary)',
        },
        close: {
          color: 'var(--color-text-secondary)',
        },
        body: {
          backgroundColor: 'var(--color-bg-elevated)',
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

  // Tooltip styles
  Tooltip: {
    defaultProps: {
      styles: {
        tooltip: {
          backgroundColor: 'var(--color-bg-elevated)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-primary)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
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
        },
        dropdown: {
          backgroundColor: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-primary)',
        },
        option: {
          color: 'var(--color-text-primary)',
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
        },
        label: {
          color: 'var(--color-text-primary)',
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
        },
        label: {
          color: 'var(--color-text-primary)',
        },
        calendar: {
          backgroundColor: 'var(--color-bg-primary)',
        },
        calendarHeader: {
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
        },
        calendarHeaderControl: {
          color: 'var(--color-text-primary)',
        },
        calendarHeaderLevel: {
          color: 'var(--color-text-primary)',
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
        },
        yearsList: {
          backgroundColor: 'var(--color-bg-primary)',
        },
        yearsListCell: {
          color: 'var(--color-text-primary)',
          border: '1px solid transparent',
        },
        weekday: {
          color: 'var(--color-text-muted)',
        },
        day: {
          color: 'var(--color-text-primary)',
          backgroundColor: 'transparent',
          border: '1px solid transparent',
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
      },
      calendarHeaderLevel: {
        color: 'var(--color-text-primary)',
      },
      month: {
        backgroundColor: 'transparent',
      },
      monthsList: {
        backgroundColor: 'transparent',
      },
      monthsListCell: {
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
      },
      yearsList: {
        backgroundColor: 'transparent',
      },
      yearsListCell: {
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
      },
      weekday: {
        color: 'var(--color-text-muted)',
      },
      day: {
        color: 'var(--color-text-primary)',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
      },
    },
  },

  Calendar: {
    styles: {
      calendar: {
        backgroundColor: 'transparent',
      },
      calendarHeader: {
        backgroundColor: 'transparent',
        color: 'var(--color-text-primary)',
      },
      calendarHeaderControl: {
        color: 'var(--color-text-primary)',
      },
      calendarHeaderLevel: {
        color: 'var(--color-text-primary)',
      },
      month: {
        backgroundColor: 'transparent',
      },
      monthsList: {
        backgroundColor: 'transparent',
      },
      monthsListCell: {
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
      },
      yearsList: {
        backgroundColor: 'transparent',
      },
      yearsListCell: {
        color: 'var(--color-text-primary)',
        border: '1px solid transparent',
      },
      weekday: {
        color: 'var(--color-text-muted)',
      },
      day: {
        color: 'var(--color-text-primary)',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
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
        list: {
          scrollbarWidth: 'none',
        },
        tab: {
          color: 'var(--color-text-secondary)',
        },
      },
    },
  },

  // MultiSelect component
  MultiSelect: {
    defaultProps: {
      styles: {
        input: {
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          borderColor: 'var(--color-border-primary)',
        },
        pill: {
          backgroundColor: 'var(--color-surface-secondary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-primary)',
        },
        dropdown: {
          backgroundColor: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-primary)',
        },
        option: {
          color: 'var(--color-text-primary)',
        },
      },
    },
  },

  // Title component
  Title: {
    defaultProps: {
      styles: {
        root: {
          color: 'var(--color-text-primary)',
        },
      },
    },
  },

  // Text component
  Text: {
    defaultProps: {
      styles: {
        root: {
          color: 'var(--color-text-primary)',
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