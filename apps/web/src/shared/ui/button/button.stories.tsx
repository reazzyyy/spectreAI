import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const meta = {
  title: "shared/ui/Button",
  component: Button,
  args: {
    children: "Войти",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Отмена" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Ждите…" },
};
