import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RiderFilterBar, useRiderFilter } from "./RiderFilterBar";
import type { TdfRider } from "./api";

const riders = [
  { id: "a", name: "Alpha", team: "Red", nationality: "FRA", is_young: 0, status: "active" },
  { id: "b", name: "Bravo", team: "Blue", nationality: "BEL", is_young: 0, status: "active" },
  { id: "c", name: "Charlie", team: "Red", nationality: "BEL", is_young: 0, status: "active" }
] as TdfRider[];

function Harness() {
  const state = useRiderFilter(riders);
  return (
    <>
      <RiderFilterBar state={state} />
      <ul aria-label="filtres">
        {state.filtered.map((r) => (
          <li key={r.id}>{r.name}</li>
        ))}
      </ul>
    </>
  );
}

describe("useRiderFilter / RiderFilterBar", () => {
  it("filtre par équipe", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/filtrer par équipe/i), {
      target: { value: "Red" }
    });
    const list = screen.getByLabelText("filtres");
    expect(within(list).getByText("Alpha")).toBeInTheDocument();
    expect(within(list).getByText("Charlie")).toBeInTheDocument();
    expect(within(list).queryByText("Bravo")).toBeNull();
  });

  it("expose les équipes et nationalités distinctes, triées", () => {
    render(<Harness />);
    const teamSelect = screen.getByLabelText(/filtrer par équipe/i);
    const teams = within(teamSelect)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);
    expect(teams).toEqual(["Blue", "Red"]);

    const natSelect = screen.getByLabelText(/filtrer par nationalité/i);
    const nats = within(natSelect)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);
    expect(nats).toEqual(["BEL", "FRA"]);
  });
});
