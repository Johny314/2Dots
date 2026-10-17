import { dotsLogo, h } from '../dom';
import type { Screen } from '../router';
import { NAME_MAX } from '../storage';
import { button } from './common';

export interface HomeProps {
  name: string;
  footer: string;
  onNameChange(name: string): void;
  onCreate(name: string): void;
  onJoin(name: string): void;
}

export function homeScreen(props: HomeProps): Screen {
  const input = h('input', {
    id: 'player-name',
    class: 'input',
    type: 'text',
    maxlength: NAME_MAX,
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'Например, Женя',
    testid: 'name-input',
    'aria-describedby': 'name-hint',
  });
  input.value = props.name;
  const hint = h('p', { id: 'name-hint', class: 'field-hint', role: 'alert' });

  const validName = (): string | null => {
    const name = input.value.trim();
    if (name) return name;
    hint.textContent = 'Введите имя — его увидит соперник';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return null;
  };

  input.addEventListener('input', () => {
    hint.textContent = '';
    input.removeAttribute('aria-invalid');
    props.onNameChange(input.value.trim());
  });

  const create = () => {
    const name = validName();
    if (name) props.onCreate(name);
  };
  const join = () => {
    const name = validName();
    if (name) props.onJoin(name);
  };

  const el = h(
    'main',
    { class: 'home' },
    h(
      'header',
      { class: 'brand' },
      dotsLogo('lg', true),
      h('h1', { class: 'title' }, '2Dots'),
      h('p', { class: 'tagline' }, 'Мини-игры для двоих по локальной сети'),
    ),
    h(
      'div',
      { class: 'panel stack' },
      h('label', { class: 'field-label', for: 'player-name' }, 'Ваше имя'),
      input,
      hint,
      h(
        'div',
        { class: 'actions' },
        button('Создать игру', {
          testid: 'create-game',
          variant: 'primary',
          hint: 'Enter',
          onClick: create,
        }),
        button('Присоединиться', { testid: 'join-game', onClick: join }),
      ),
    ),
    h('footer', { class: 'footer', testid: 'mode' }, props.footer),
  );

  return {
    id: 'home',
    el,
    enter: create,
    mounted: () => {
      input.focus();
      input.select();
    },
  };
}
