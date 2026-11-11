import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, initialsFromLabel } from "./avatar";

describe("initialsFromLabel", () => {
  it("builds initials from email local part", () => {
    expect(initialsFromLabel("elena.krylova@example.test")).toBe("EK");
  });

  it("builds initials from a two-word name", () => {
    expect(initialsFromLabel("Елена Крылова")).toBe("ЕК");
  });
});

describe("Avatar", () => {
  it("renders initials", () => {
    render(<Avatar label="owner@localhost.ru" />);
    expect(screen.getByText("OW")).toBeInTheDocument();
  });
});
