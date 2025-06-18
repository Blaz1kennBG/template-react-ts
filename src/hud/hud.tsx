import { useUserStore } from "../state/user";


export const Hud = () => {
    const user = useUserStore();

    return (
        <div className="flex gap-3 items-center bg-black text-white p-2 w-screen absolute bottom-0 left-0">
            <span>❤ {user.health}</span>
            <span>⚔ {user.damage}</span>
            <span>🥾 {user.movement_speed}</span>
        </div>
    );
};
