import { create } from "zustand";

interface UserState {
    health: number;
    damage: number;
    movement_speed: number;
    setUser: (state: any) => void;
}

export const useUserStore = create<UserState>((set) => ({
    health: 10,
    damage: 1,
    movement_speed: 200,
    setUser: (state: UserState) => set(state),
}));
