import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import 'drive_config.dart';
import 'drive_service.dart';
import 'drive_preview.dart';
import 'drive_google_button.dart';

class ContentsPage extends StatefulWidget {
  const ContentsPage({super.key, this.active = true, this.service});
  final bool active;
  final DriveService? service;
  @override
  State<ContentsPage> createState() => _ContentsPageState();
}

class _ContentsPageState extends State<ContentsPage> {
  late final DriveService _drive = widget.service ?? DriveService();
  final _search = TextEditingController();
  String _current = DriveConfig.rootId, _query = '';
  @override
  void initState() {
    super.initState();
    _drive.addListener(_changed);
    _drive.initialize();
  }

  void _changed() {
    if (!mounted) return;
    if (!_drive.connected) {
      _current = DriveConfig.rootId;
      _query = '';
      _search.clear();
    } else if (!_drive.busy &&
        _drive.updated != null &&
        _current != DriveConfig.rootId &&
        !_drive.files.any((f) => f.id == _current)) {
      _current = DriveConfig.rootId;
    }
    setState(() {});
  }

  @override
  void dispose() {
    _drive.removeListener(_changed);
    _drive.dispose();
    _search.dispose();
    super.dispose();
  }

  void _folder(String id) {
    FocusScope.of(context).unfocus();
    setState(() {
      _current = id;
      _query = '';
      _search.clear();
    });
  }

  List<DriveFile> get _crumbs {
    final path = <DriveFile>[];
    String id = _current;
    final seen = <String>{};
    while (id != DriveConfig.rootId && seen.add(id)) {
      final f = _drive.files.where((f) => f.id == id).firstOrNull;
      if (f == null) break;
      path.insert(0, f);
      id = f.parent;
    }
    return path;
  }

  void _back() {
    if (_query.isNotEmpty) {
      setState(() {
        _query = '';
        _search.clear();
      });
      return;
    }
    if (_crumbs.isNotEmpty) _folder(_crumbs.last.parent);
  }

  Future<void> _external(DriveFile file) async {
    try {
      if (!await launchUrl(file.url, mode: LaunchMode.externalApplication)) {
        throw Exception();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Drive 링크를 열지 못했습니다.')));
      }
    }
  }

  void _open(DriveFile file) {
    if (file.isFolder) {
      _folder(file.id);
    } else if (file.isImage || file.isVideo) {
      Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => DrivePreview(file: file, service: _drive),
        ),
      );
    } else {
      _external(file);
    }
  }

  String _size(int size) => size == 0
      ? ''
      : size >= 1048576
      ? '${(size / 1048576).toStringAsFixed(1)} MB'
      : '${(size / 1024).ceil()} KB';
  String _date(DateTime? date) {
    if (date == null) return '';
    final d = date.toLocal();
    return '${d.year}.${d.month.toString().padLeft(2, '0')}.${d.day.toString().padLeft(2, '0')}';
  }

  IconData _icon(DriveFile file) => file.isFolder
      ? Icons.folder_outlined
      : file.isImage
      ? Icons.image_outlined
      : file.isVideo
      ? Icons.play_circle_outline
      : file.mime == 'application/vnd.google-apps.shortcut'
      ? Icons.shortcut
      : Icons.description_outlined;
  Widget _cover(DriveFile file) {
    final fallback = Center(
      child: Icon(_icon(file), size: 44, color: const Color(0xff98a2b3)),
    );
    return ColoredBox(
      color: const Color(0xfff0f2f6),
      child: AspectRatio(
        aspectRatio: 16 / 10,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (file.thumbnail.isNotEmpty && !file.isFolder)
              FutureBuilder<Uint8List>(
                future: _drive.thumbnail(file),
                builder: (context, snapshot) => snapshot.hasData
                    ? Image.memory(
                        snapshot.data!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => fallback,
                      )
                    : fallback,
              )
            else
              fallback,
            Positioned(
              left: 12,
              bottom: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Text(
                  file.isFolder
                      ? 'FOLDER'
                      : file.isImage
                      ? 'IMAGE'
                      : file.isVideo
                      ? 'VIDEO'
                      : 'FILE',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: .7,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _card(DriveFile file) => Material(
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: const BorderSide(color: Color(0xffe2e6ed)),
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () => _open(file),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _cover(file),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                child: Text(
                  file.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    height: 1.5,
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  [
                    _size(file.size),
                    _date(file.modified),
                  ].where((s) => s.isNotEmpty).join(' · '),
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xff667085),
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Drive에서 열기',
                onPressed: () => _external(file),
                icon: const Icon(
                  Icons.open_in_new,
                  size: 17,
                  color: Color(0xff667085),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
  Widget _empty(String title, String body, {Widget? action}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
    child: Column(
      children: [
        const Icon(
          Icons.folder_open_outlined,
          size: 48,
          color: Color(0xff98a2b3),
        ),
        const SizedBox(height: 16),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Text(
          body,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 13,
            height: 1.7,
            color: Color(0xff667085),
          ),
        ),
        if (action != null)
          Padding(padding: const EdgeInsets.only(top: 20), child: action),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final visible = _drive.files
        .where(
          (f) => _query.isEmpty
              ? f.parent == _current
              : f.name.toLowerCase().contains(_query.toLowerCase()),
        )
        .toList();
    return PopScope(
      canPop:
          !widget.active || (_current == DriveConfig.rootId && _query.isEmpty),
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && widget.active) _back();
      },
      child: ColoredBox(
        color: const Color(0xfff9fafb),
        child: SafeArea(
          top: false,
          child: RefreshIndicator(
            onRefresh: () =>
                _drive.connected ? _drive.refresh() : _drive.initialize(),
            child: CustomScrollView(
              key: const PageStorageKey('contents'),
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 12, 0),
                  sliver: SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'CONTENT LIBRARY',
                          style: TextStyle(
                            fontSize: 10,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w700,
                            color: Color(0xff667085),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                '콘텐츠 라이브러리',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -.8,
                                ),
                              ),
                            ),
                            IconButton(
                              tooltip: '루트 폴더를 Drive에서 열기',
                              onPressed: () => _external(
                                DriveFile(
                                  DriveConfig.rootId,
                                  'Contents',
                                  'application/vnd.google-apps.folder',
                                  '',
                                ),
                              ),
                              icon: const Icon(Icons.open_in_new, size: 19),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Google Drive의 폴더와 제작 자료를 한곳에서 확인하세요.',
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.7,
                            color: Color(0xff667085),
                          ),
                        ),
                        const SizedBox(height: 20),
                        if (!_drive.connected) ...[
                          if (kIsWeb && _drive.ready && _drive.account == null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: driveGoogleButton(),
                            ),
                          FilledButton.icon(
                            onPressed: _drive.busy
                                ? null
                                : () => _drive.connect(),
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xff161c27),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 14,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            icon: const Icon(Icons.link, size: 18),
                            label: Text(
                              _drive.busy
                                  ? '연결 중…'
                                  : _drive.account != null
                                  ? 'Drive 권한 허용'
                                  : 'Google Drive 연결',
                            ),
                          ),
                        ] else
                          Wrap(
                            spacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              OutlinedButton.icon(
                                onPressed: _drive.busy
                                    ? null
                                    : () => _drive.refresh(),
                                icon: const Icon(Icons.refresh, size: 18),
                                label: const Text('새로고침'),
                              ),
                              TextButton(
                                onPressed: () => _drive.disconnect(
                                  message: 'Google Drive 연결을 해제했습니다.',
                                ),
                                child: const Text('연결 해제'),
                              ),
                            ],
                          ),
                        const SizedBox(height: 14),
                        Semantics(
                          liveRegion: true,
                          child: Text(
                            _drive.connected
                                ? '${_drive.account?.email ?? 'Google Drive'} · ${_drive.files.length}개 항목${_drive.updated == null ? '' : ' · ${_drive.updated!.hour.toString().padLeft(2, '0')}:${_drive.updated!.minute.toString().padLeft(2, '0')} 갱신'}'
                                : '계정을 연결하면 폴더와 파일을 볼 수 있습니다.',
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.7,
                              color: Color(0xff667085),
                            ),
                          ),
                        ),
                        if (_drive.error != null)
                          Container(
                            width: double.infinity,
                            margin: const EdgeInsets.only(top: 12),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xfffff2f0),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Semantics(
                              liveRegion: true,
                              child: Text(
                                _drive.error!,
                                style: const TextStyle(
                                  fontSize: 13,
                                  height: 1.7,
                                  color: Color(0xffa52b2b),
                                ),
                              ),
                            ),
                          ),
                        if (_drive.connected) ...[
                          const SizedBox(height: 16),
                          const Divider(),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: [
                                TextButton(
                                  onPressed: () => _folder(DriveConfig.rootId),
                                  child: const Text('Contents'),
                                ),
                                for (final f in _crumbs) ...[
                                  const Icon(
                                    Icons.chevron_right,
                                    size: 16,
                                    color: Color(0xff98a2b3),
                                  ),
                                  TextButton(
                                    onPressed: () => _folder(f.id),
                                    child: Text(f.name),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _search,
                            onChanged: (v) => setState(() => _query = v.trim()),
                            decoration: InputDecoration(
                              hintText: '전체 폴더와 파일 검색',
                              prefixIcon: const Icon(Icons.search),
                              suffixIcon: _query.isEmpty
                                  ? null
                                  : IconButton(
                                      tooltip: '검색어 지우기',
                                      onPressed: () => setState(() {
                                        _query = '';
                                        _search.clear();
                                      }),
                                      icon: const Icon(Icons.close),
                                    ),
                              filled: true,
                              fillColor: Colors.white,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(
                                  color: Color(0xffe2e6ed),
                                ),
                              ),
                            ),
                          ),
                        ],
                        if (_drive.busy)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: LinearProgressIndicator(),
                          ),
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ),
                if (!_drive.connected)
                  SliverToBoxAdapter(
                    child: _empty(
                      '제작 자료를 연결하세요',
                      'Firebase 로그인과 별개로, 이 폴더에 접근할 수 있는 Google 계정을 선택해주세요.',
                    ),
                  )
                else if (visible.isEmpty)
                  SliverToBoxAdapter(
                    child: _empty(
                      _drive.busy
                          ? '폴더를 불러오고 있습니다'
                          : _drive.error != null
                          ? '자료를 불러오지 못했습니다'
                          : _query.isNotEmpty
                          ? '검색 결과가 없습니다'
                          : '폴더가 비어 있습니다',
                      _drive.busy
                          ? '전체 하위 폴더와 파일을 확인하는 중입니다.'
                          : _drive.error != null
                          ? '계정과 폴더 접근 권한을 확인한 뒤 새로고침해주세요.'
                          : _query.isNotEmpty
                          ? '다른 이름으로 검색해보세요.'
                          : '새 자료가 추가되면 새로고침으로 확인할 수 있습니다.',
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    sliver: SliverLayoutBuilder(
                      builder: (context, constraints) {
                        final columns =
                            constraints.crossAxisExtent >= 700 &&
                                MediaQuery.textScalerOf(context).scale(14) < 22
                            ? 2
                            : 1;
                        return SliverList.builder(
                          itemCount: (visible.length / columns).ceil(),
                          itemBuilder: (context, row) => Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                for (int c = 0; c < columns; c++) ...[
                                  if (c > 0) const SizedBox(width: 16),
                                  Expanded(
                                    child: row * columns + c < visible.length
                                        ? _card(visible[row * columns + c])
                                        : const SizedBox.shrink(),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
