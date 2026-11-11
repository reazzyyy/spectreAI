import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Icon, type IconName } from "./icon";

const names: IconName[] = [
  "home",
  "folder",
  "users",
  "search",
  "plus",
  "sidebar",
  "user",
  "map",
  "warning",
  "lock",
  "chevron",
  "arrow",
  "down",
  "more",
];

const meta = {
  title: "shared/ui/Icon",
  component: Icon,
  args: { name: "home", size: 24 },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Gallery: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "#20211f" }}>
      {names.map((name) => (
        <div key={name} style={{ display: "grid", placeItems: "center", gap: 6 }}>
          <Icon name={name} size={22} />
          <span style={{ fontSize: 12 }}>{name}</span>
        </div>
      ))}
    </div>
  ),
};
