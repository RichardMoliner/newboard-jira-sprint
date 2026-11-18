import { describe, expect, test, vi } from 'vitest';
import { fetchAvatarUrls } from './fetchAvatars.js';

function downloadStub() {
  return vi.fn(async (url: string) => `data:image/png;base64,${url}`);
}

describe('fetchAvatarUrls', () => {
  test('busca o avatar de cada nome ainda não conhecido e baixa a imagem (autenticado) como data URI', async () => {
    const searchUser = vi.fn(async (name: string) => [{ avatarUrls: { '48x48': `https://jira/avatar/${name}` } }]);
    const downloadAvatar = downloadStub();
    const result = await fetchAvatarUrls(['Fulano'], {}, searchUser, downloadAvatar);
    expect(result).toEqual({ Fulano: 'data:image/png;base64,https://jira/avatar/Fulano' });
    expect(searchUser).toHaveBeenCalledWith('Fulano');
    expect(downloadAvatar).toHaveBeenCalledWith('https://jira/avatar/Fulano');
  });

  test('não chama searchUser nem downloadAvatar de novo para nomes já presentes no cache (mesmo com valor null)', async () => {
    const searchUser = vi.fn();
    const downloadAvatar = downloadStub();
    const result = await fetchAvatarUrls(
      ['Fulano', 'Sicrano'],
      { Fulano: 'data:image/png;base64,abc', Sicrano: null },
      searchUser,
      downloadAvatar,
    );
    expect(result).toEqual({ Fulano: 'data:image/png;base64,abc', Sicrano: null });
    expect(searchUser).not.toHaveBeenCalled();
    expect(downloadAvatar).not.toHaveBeenCalled();
  });

  test('registra null quando a busca não encontra nenhum usuário', async () => {
    const searchUser = vi.fn(async () => []);
    const downloadAvatar = downloadStub();
    const result = await fetchAvatarUrls(['Ninguém'], {}, searchUser, downloadAvatar);
    expect(result).toEqual({ Ninguém: null });
    expect(downloadAvatar).not.toHaveBeenCalled();
  });

  test('registra null quando o usuário encontrado não tem avatarUrls', async () => {
    const searchUser = vi.fn(async () => [{}]);
    const downloadAvatar = downloadStub();
    const result = await fetchAvatarUrls(['SemFoto'], {}, searchUser, downloadAvatar);
    expect(result).toEqual({ SemFoto: null });
    expect(downloadAvatar).not.toHaveBeenCalled();
  });

  test('uma falha pontual na busca de uma pessoa não derruba as demais — registra null pra ela', async () => {
    const searchUser = vi.fn(async (name: string) => {
      if (name === 'ComErro') throw new Error('timeout');
      return [{ avatarUrls: { '48x48': `https://jira/avatar/${name}` } }];
    });
    const downloadAvatar = downloadStub();
    const result = await fetchAvatarUrls(['ComErro', 'Fulano'], {}, searchUser, downloadAvatar);
    expect(result).toEqual({ ComErro: null, Fulano: 'data:image/png;base64,https://jira/avatar/Fulano' });
  });

  test('uma falha no download da imagem (ex.: autenticação expirada) também vira null, sem derrubar as demais', async () => {
    const searchUser = vi.fn(async (name: string) => [{ avatarUrls: { '48x48': `https://jira/avatar/${name}` } }]);
    const downloadAvatar = vi.fn(async (url: string) => {
      if (url.endsWith('ComErro')) throw new Error('401');
      return `data:image/png;base64,${url}`;
    });
    const result = await fetchAvatarUrls(['ComErro', 'Fulano'], {}, searchUser, downloadAvatar);
    expect(result).toEqual({ ComErro: null, Fulano: 'data:image/png;base64,https://jira/avatar/Fulano' });
  });

  test('preserva entradas do cache que não foram pedidas desta vez', async () => {
    const searchUser = vi.fn(async () => []);
    const downloadAvatar = downloadStub();
    const result = await fetchAvatarUrls([], { Antigo: 'data:image/png;base64,abc' }, searchUser, downloadAvatar);
    expect(result).toEqual({ Antigo: 'data:image/png;base64,abc' });
  });
});
