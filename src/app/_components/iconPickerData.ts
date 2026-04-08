// Curated Tabler icon names for the icon picker, organized by category
export const PICKER_ICONS: Record<string, string[]> = {
  "Goals & Achievement": [
    "IconTarget",
    "IconTrophy",
    "IconStar",
    "IconMedal",
    "IconAward",
    "IconFlame",
    "IconBolt",
    "IconRocket",
    "IconFlag",
    "IconFlagFilled",
    "IconChecklist",
    "IconCircleCheck",
    "IconThumbUp",
  ],
  "Work & Business": [
    "IconBriefcase",
    "IconPresentation",
    "IconChartBar",
    "IconChartLine",
    "IconChartPie",
    "IconBuildingSkyscraper",
    "IconTie",
    "IconClipboard",
    "IconCalendar",
    "IconClock",
    "IconMail",
    "IconPhone",
    "IconUsers",
    "IconUserCircle",
  ],
  "Finance": [
    "IconCash",
    "IconCoin",
    "IconPigMoney",
    "IconWallet",
    "IconCreditCard",
    "IconReceipt",
    "IconReportMoney",
    "IconTrendingUp",
    "IconBuildingBank",
    "IconDiamond",
  ],
  "Health & Wellness": [
    "IconHeartbeat",
    "IconHeart",
    "IconYoga",
    "IconRun",
    "IconBike",
    "IconSwimming",
    "IconApple",
    "IconSalad",
    "IconMoon",
    "IconSun",
    "IconDroplet",
    "IconStretching",
  ],
  "Education & Learning": [
    "IconBook",
    "IconBooks",
    "IconSchool",
    "IconCertificate",
    "IconBulb",
    "IconBrain",
    "IconMicroscope",
    "IconNotebook",
    "IconPencil",
    "IconLanguage",
    "IconMath",
    "IconAtom",
  ],
  "Creative": [
    "IconPalette",
    "IconBrush",
    "IconMusic",
    "IconCamera",
    "IconPhoto",
    "IconMovie",
    "IconMicrophone",
    "IconPiano",
    "IconGuitarPick",
    "IconDeviceTv",
    "IconWriting",
    "IconVinyl",
  ],
  "Technology": [
    "IconCode",
    "IconDevices",
    "IconDeviceDesktop",
    "IconDeviceLaptop",
    "IconBrandGithub",
    "IconDatabase",
    "IconCloud",
    "IconWifi",
    "IconCpu",
    "IconTerminal",
    "IconApi",
    "IconBug",
  ],
  "Nature & Travel": [
    "IconPlane",
    "IconMap",
    "IconCompass",
    "IconMountain",
    "IconTree",
    "IconLeaf",
    "IconFlower",
    "IconSunrise",
    "IconBeach",
    "IconCar",
    "IconWorld",
    "IconTent",
  ],
  "Relationships & Home": [
    "IconHome",
    "IconHeart",
    "IconFriends",
    "IconMoodSmile",
    "IconGift",
    "IconBabyCarriage",
    "IconDog",
    "IconCat",
    "IconArmchair",
    "IconCoffee",
    "IconToolsKitchen",
    "IconSoup",
  ],
  "General": [
    "IconCircle",
    "IconSquare",
    "IconTriangle",
    "IconHexagon",
    "IconPoint",
    "IconBookmark",
    "IconPin",
    "IconTag",
    "IconHash",
    "IconAt",
    "IconLink",
    "IconLock",
    "IconShield",
    "IconEye",
    "IconSearch",
    "IconSettings",
  ],
};

// Flat list of all icon names for search
export const ALL_ICON_NAMES: string[] = Object.values(PICKER_ICONS).flat();

// Emoji categories for the emoji picker
export const PICKER_EMOJIS: Record<string, string[]> = {
  "Frequently used": [
    "🎯", "🚀", "💪", "⭐", "🔥", "💡", "🏆", "❤️",
    "✅", "💯", "🙌", "👏", "🎉", "⚡", "🌟", "💎",
  ],
  "Smileys & People": [
    "😊", "😎", "🤔", "😄", "🥳", "😍", "🤩", "😇",
    "🧠", "👀", "💪", "🙌", "👏", "🤝", "✌️", "👋",
    "🙏", "💪", "👑", "🦸", "🧑‍💻", "🧑‍🎨", "🧑‍🔬", "🧑‍🏫",
  ],
  "Nature & Animals": [
    "🌱", "🌿", "🌻", "🌸", "🌳", "🍀", "🌊", "🔆",
    "🌈", "⛰️", "🦋", "🐾", "🦁", "🐝", "🕊️", "🌍",
  ],
  "Food & Drink": [
    "🍎", "☕", "🥗", "🍕", "🥑", "🫐", "🍽️", "🥂",
    "🧃", "🍰", "🥤", "🍇", "🥕", "🌮", "🍩", "🧁",
  ],
  "Activities & Sports": [
    "⚽", "🏀", "🎾", "🏃", "🚴", "🏋️", "🧘", "🎿",
    "🏊", "🎮", "🎨", "🎵", "📚", "🎲", "🎭", "🏕️",
  ],
  "Objects & Tools": [
    "💰", "💻", "📱", "🏠", "✈️", "🚗", "📈", "📊",
    "🔑", "🔧", "⏰", "📅", "📝", "📌", "🎒", "💼",
    "📦", "🔔", "💳", "🏦", "📣", "🎤", "📷", "🔭",
  ],
  "Symbols & Flags": [
    "✅", "❌", "💯", "⚡", "🔑", "🔒", "🛡️", "⚙️",
    "♻️", "💠", "🔷", "🔶", "❤️", "💜", "💙", "💚",
    "💛", "🧡", "🤍", "🖤", "⭕", "✨", "💫", "🌀",
  ],
};

// Flat list of all emojis for search (with deduplication)
export const ALL_EMOJIS: string[] = [...new Set(Object.values(PICKER_EMOJIS).flat())];

// Color options for Tabler icons
export const ICON_COLORS = [
  { key: "purple", value: "var(--mantine-color-violet-6)", label: "Purple" },
  { key: "indigo", value: "var(--mantine-color-indigo-6)", label: "Indigo" },
  { key: "blue", value: "var(--mantine-color-blue-6)", label: "Blue" },
  { key: "teal", value: "var(--mantine-color-teal-6)", label: "Teal" },
  { key: "green", value: "var(--mantine-color-green-6)", label: "Green" },
  { key: "lime", value: "var(--mantine-color-lime-6)", label: "Lime" },
  { key: "yellow", value: "var(--mantine-color-yellow-6)", label: "Yellow" },
  { key: "orange", value: "var(--mantine-color-orange-6)", label: "Orange" },
  { key: "red", value: "var(--mantine-color-red-6)", label: "Red" },
  { key: "pink", value: "var(--mantine-color-pink-6)", label: "Pink" },
] as const;

export type IconColorKey = (typeof ICON_COLORS)[number]["key"];

// Get the CSS value for a color key
export function getIconColorValue(key: string | null | undefined): string {
  if (!key) return "var(--mantine-color-gray-6)";
  const found = ICON_COLORS.find((c) => c.key === key);
  return found?.value ?? "var(--mantine-color-gray-6)";
}
