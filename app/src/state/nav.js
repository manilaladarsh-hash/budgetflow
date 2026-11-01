import { createContext, useContext } from 'react';

// Navigation + global sheets (add entry, edit transaction, cycle details).
export const NavContext = createContext(null);
export const useNav = () => useContext(NavContext);
