import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders children and primary variant by default", () => {
    render(<Button>Сохранить</Button>);
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });

  it("respects disabled", () => {
    render(<Button disabled>Ждите</Button>);
    expect(screen.getByRole("button", { name: "Ждите" })).toBeDisabled();
  });
});
