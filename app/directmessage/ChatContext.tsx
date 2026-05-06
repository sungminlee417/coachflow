"use client";
import {
  createContext,
  useContext,
  useState,
  ReactNode,
  Children,
} from "react";
//object types
interface ChatContextType {
  open: boolean;
  openChat: () => void;
  closeChat: () => void;
}
const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  //state for if chat open or not
  const [open, setOpen] = useState(false);

  const openChat = () => setOpen(true);

  const closeChat = () => setOpen(false);
  // exposing values
  return (
    <ChatContext.Provider value={{ openChat, closeChat, open }}>
      {children}{" "}
    </ChatContext.Provider>
  );
};
export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error("context use: context not found");
  return context;
};
