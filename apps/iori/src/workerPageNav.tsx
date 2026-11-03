import { BottomNav } from './ui/components/BottomNav.tsx';
import { PostModal } from './ui/components/PostModal.tsx';
import { Sidebar } from './ui/components/Sidebar.tsx';

export const renderSidebar = async (isLoggedIn: boolean): Promise<string> =>
  await (<Sidebar isLoggedIn={isLoggedIn} />).toString();

export const renderBottomNav = async (isLoggedIn: boolean): Promise<string> =>
  await (<BottomNav isLoggedIn={isLoggedIn} />).toString();

export const renderPostModal = async (): Promise<string> => await (<PostModal />).toString();
