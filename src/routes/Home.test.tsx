import { render, screen } from "@testing-library/react";
import Home from "./Home";

test("renders hero title", () => {
  render(<Home />);
  expect(
    screen.getByText(/The Bitcoin Ecosystem/i),
  ).toBeInTheDocument();
});
