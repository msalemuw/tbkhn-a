import { type ComponentType, createElement } from 'react';

// The real screen lives in src/components/add-photo-screen.tsx and is loaded only when this route is opened.
// It uses the camera and photo libraries, which a phone on an older store build does not have: loading them at
// start-up would close the app, so nothing outside this function may import them.
function loadScreen(): ComponentType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/components/add-photo-screen').default;
}

export default function AddPhotoRoute() {
  return createElement(loadScreen());
}
