import wordList from './components/list/word-list.vue';
import wordEditor from './components/word-editor.vue';
import settings from './components/settings.vue';

const routes = [
    { path: '/list', component: wordList, name: 'list' },
    { path: '/word-editor/:id', component: wordEditor, name: 'editor', props: true },
    { path: '/settings', component: settings, name: 'settings' }
];

export default routes;