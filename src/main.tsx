import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AccountGate from './components/AccountGate'
import { MotionConfig } from 'motion/react'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/manrope'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><MotionConfig reducedMotion="user"><AccountGate>{(session, signOut) => <App key={session.user.id} account={session.user} school={session.school} onSignOut={signOut} />}</AccountGate></MotionConfig></React.StrictMode>)
