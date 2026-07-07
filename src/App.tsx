/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Role } from './types';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';

export default function App() {
  const [role, setRole] = useState<Role | null>(null);

  return (
    <>
      {!role ? (
        <LoginScreen onLogin={setRole} />
      ) : (
        <Dashboard role={role} onLogout={() => setRole(null)} />
      )}
    </>
  );
}
