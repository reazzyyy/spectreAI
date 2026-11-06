import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./input";

const meta = {
  title: "shared/ui/Input",
  component: Input,
  args: {
    id: "email",
    label: "Email",
    placeholder: "user@example.com",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    id: "organizationId",
    label: "ID организации",
    hint: "UUID организации из membership.",
  },
};

export const WithError: Story = {
  args: {
    id: "password",
    label: "Пароль",
    type: "password",
    error: "Введите пароль.",
  },
};
