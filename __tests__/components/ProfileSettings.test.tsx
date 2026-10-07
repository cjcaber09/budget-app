import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfileSettings } from "../../src/components/ProfileSettings";
import { usePreferencesStore } from "../../src/stores/usePreferencesStore";
const mockUpdate = jest.fn();
const mockSignIn = jest.fn();
const mockPassword = jest.fn();
let mockFailure=false;
jest.mock("../../src/hooks/useProfile", () => ({
  useProfile: () => ({ isError: false, refetch: jest.fn() }),
  useUpdateProfile: () => ({ mutate: mockUpdate, isPending: false,isError:mockFailure,variables:{display_name:'Unsaved name'} }),
}));
jest.mock("../../src/hooks/useSession", () => ({
  useSession: () => ({
    session: { user: { id: "u", email: "person@example.test" } },
    loading: false,
  }),
}));
jest.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      updateUser: (...args: unknown[]) => mockPassword(...args),
    },
  },
}));
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProfileSettings />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mockFailure=false;
  mockUpdate.mockReset();
  mockSignIn.mockReset();
  mockPassword.mockReset();
  usePreferencesStore
    .getState()
    .setProfile({
      user_id: "u",
      display_name: "Mira",
      avatar_path: null,
      appearance: "system",
      currency: "USD",
      timezone: "Asia/Manila",
    });
});
it('shows a recoverable failed name save beside its retained draft',()=>{mockFailure=true;mount();fireEvent.changeText(screen.getByLabelText('Display name'),'Unsaved name');expect(screen.getByText(/Could not save your name/)).toBeTruthy();expect(screen.getByLabelText('Display name').props.value).toBe('Unsaved name');fireEvent.press(screen.getByText('Save name'));expect(mockUpdate).toHaveBeenCalledWith({display_name:'Unsaved name'},expect.any(Object));});
afterEach(() => act(() => usePreferencesStore.getState().setProfile(null)));
it("submits only the changed name field", () => {
  mount();
  fireEvent.changeText(screen.getByLabelText("Display name"), "New name");
  fireEvent.press(screen.getByText("Save name"));
  expect(mockUpdate).toHaveBeenCalledWith(
    { display_name: "New name" },
    expect.any(Object),
  );
});
it("requires explicit currency-unit confirmation before updating", () => {
  mount();
  fireEvent.press(screen.getByText("PHP"));
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(screen.getByText(/No exchange-rate conversion/)).toBeTruthy();
  fireEvent.press(screen.getByText("Change unit to PHP"));
  expect(mockUpdate).toHaveBeenCalledWith(
    { currency: "PHP" },
    expect.any(Object),
  );
});
it("selects appearance and searches the full timezone list", () => {
  mount();
  fireEvent.press(screen.getByText("Light"));
  expect(mockUpdate).toHaveBeenCalledWith({ appearance: "light" });
  fireEvent.press(screen.getByText("Asia/Manila"));
  fireEvent.changeText(screen.getByLabelText("Search timezones"), "New_York");
  fireEvent.press(screen.getByText("America/New York"));
  expect(mockUpdate).toHaveBeenCalledWith(
    { timezone: "America/New_York" },
    expect.any(Object),
  );
});
function fillPassword() {
  fireEvent.press(screen.getByText("Change password"));
  fireEvent.changeText(
    screen.getByLabelText("Current password"),
    "old-password",
  );
  fireEvent.changeText(screen.getByLabelText("New password"), "new-password");
  fireEvent.changeText(
    screen.getByLabelText("Confirm new password"),
    "new-password",
  );
  fireEvent.press(screen.getByText("Save new password"));
}
it("never updates a password when current-password verification fails", async () => {
  mockSignIn.mockResolvedValue({ error: { message: "Wrong" }, data: {} });
  mount();
  fillPassword();
  await waitFor(() =>
    expect(
      screen.getByText("Your current password was not accepted."),
    ).toBeTruthy(),
  );
  expect(mockPassword).not.toHaveBeenCalled();
});
it("updates a verified password and clears the input fields", async () => {
  mockSignIn.mockResolvedValue({ error: null, data: { user: { id: "u" } } });
  mockPassword.mockResolvedValue({ error: null });
  mount();
  fillPassword();
  await waitFor(() =>
    expect(screen.getByText("Password changed.")).toBeTruthy(),
  );
  expect(mockPassword).toHaveBeenCalledWith({
    password: "new-password",
    current_password: "old-password",
  });
  fireEvent.press(screen.getByText("Change password"));
  expect(screen.getByLabelText("Current password").props.value).toBe("");
  expect(screen.getByLabelText("New password").props.value).toBe("");
});
