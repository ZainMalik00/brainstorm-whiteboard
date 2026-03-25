/* eslint-disable react-refresh/only-export-components -- hook + provider module */
import { createContext, useContext, type ReactNode } from "react";

export type BoardTransform = {
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
};

const BoardTransformContext = createContext<BoardTransform | null>(null);

export function BoardTransformProvider({
  value,
  children,
}: {
  value: BoardTransform;
  children: ReactNode;
}) {
  return (
    <BoardTransformContext.Provider value={value}>
      {children}
    </BoardTransformContext.Provider>
  );
}

export function useBoardTransform(): BoardTransform {
  const c = useContext(BoardTransformContext);
  if (!c) throw new Error("useBoardTransform outside provider");
  return c;
}
