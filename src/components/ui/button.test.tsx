import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("gives the cleaner size a 56px minimum height and large text", () => {
    render(<Button size="cleaner">Done</Button>);
    const button = screen.getByRole("button", { name: "Done" });
    expect(button.className).toContain("min-h-14");
    expect(button.className).toContain("text-lg");
  });
});
