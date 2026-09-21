import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'strategy_catalog.dart';
import 'strategy_reader.dart';
import 'strategy_sound.dart';
import 'strategy_gallery.dart';

class StrategyPage extends StatefulWidget {
  const StrategyPage({super.key});
  @override
  State<StrategyPage> createState() => _StrategyPageState();
}

class _StrategyPageState extends State<StrategyPage> {
  late Future<StrategyCatalog> _loading = StrategyCatalog.load();
  StrategyCatalog? _catalog;
  String? _brandId, _productId;
  int _tab = 0, _message = 0, _weight = 400;
  bool _lightLogo = false;
  String? _font;
  int _fontRequest = 0;
  final _sample = TextEditingController();
  static const _tabs = ['브랜드', '상품', '경쟁', '고객', '브리프'];
  static const _keys = ['brand', 'product', 'competitor', 'customer', 'brief'];
  StrategyCatalog get catalog => _catalog!;
  Map<String, dynamic> get brand =>
      object(catalog.brands.firstWhere((b) => object(b)['id'] == _brandId));
  List<dynamic> get products => items(brand['products']);
  Map<String, dynamic> get product =>
      object(products.firstWhere((p) => object(p)['id'] == _productId));
  Map<String, dynamic> get profile => catalog.profile(_brandId!, _productId!);
  StrategyReader get reader => StrategyReader(catalog, _brandId!, _productId!);
  String? source(String key) => catalog.source(brand, product, key);
  List<dynamic> _weights(Map<String, dynamic> type) =>
      items(type['weights']).isNotEmpty
      ? items(type['weights'])
      : [
          for (final w in [400, 500, 600, 700]) {'value': w, 'label': '$w'},
        ];

  @override
  void dispose() {
    _sample.dispose();
    super.dispose();
  }

  void _select(String b, String p) {
    FocusScope.of(context).unfocus();
    setState(() {
      _brandId = b;
      _productId = p;
      _message = 0;
      _lightLogo = false;
      _weight = 400;
      _font = null;
    });
    _sample.text = text(
      object(object(profile['brand'])['typography'])['sample'],
    );
    _loadFont();
  }

  Future<void> _loadFont() async {
    final request = ++_fontRequest;
    final type = object(object(profile['brand'])['typography']);
    final weights = _weights(type).map(object);
    final selected = weights.where((w) => w['value'] == _weight).firstOrNull;
    final asset = object(catalog.assets[selected?['asset'] ?? type['asset']]);
    if (asset.isEmpty) return;
    final family = 'strategy-$_brandId-$_productId-$_weight';
    try {
      final loader = FontLoader(family)
        ..addFont(rootBundle.load(text(asset['fontFile'] ?? asset['file'])));
      await loader.load();
      if (mounted && request == _fontRequest) setState(() => _font = family);
    } catch (_) {
      if (mounted && request == _fontRequest) setState(() => _font = null);
    }
  }

  Future<void> _copy(String value) async {
    try {
      await Clipboard.setData(ClipboardData(text: value));
      if (mounted) StrategyReader.notify(context, '복사했습니다.');
    } catch (_) {
      if (mounted) StrategyReader.notify(context, '복사하지 못했습니다.');
    }
  }

  Widget _panel(String title, Widget child, {Widget? trailing}) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xffe2e6ed)),
      borderRadius: BorderRadius.circular(16),
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 12, 12),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 17,
                  ),
                ),
              ),
              ?trailing,
            ],
          ),
        ),
        child,
      ],
    ),
  );
  Widget _facts(List<dynamic> facts) => Column(
    children: facts.map((v) {
      final f = object(v);
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0xffeef0f4))),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final label = Text(
              text(f['label']),
              style: const TextStyle(fontSize: 13, color: Color(0xff667085)),
            );
            final value = SelectableText(
              '${text(f['value'])}${text(f['unit'])}',
              style: TextStyle(
                fontSize: f['price'] == true ? 18 : 14,
                fontWeight: f['price'] == true
                    ? FontWeight.w700
                    : FontWeight.w500,
                height: 1.6,
              ),
            );
            if (constraints.maxWidth < 280 ||
                MediaQuery.textScalerOf(context).scale(14) > 18) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [label, const SizedBox(height: 6), value],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 100, child: label),
                const SizedBox(width: 12),
                Expanded(child: value),
              ],
            );
          },
        ),
      );
    }).toList(),
  );
  Widget _section(dynamic value, {String? label, String? note}) {
    final s = object(value);
    final path = source(text(s['document']));
    final body = catalog.section(path, text(s['heading']));
    if (body.isEmpty && (note ?? '').isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xffe2e6ed)),
      ),
      child: ExpansionTile(
        key: ValueKey(
          '$_brandId/$_productId/${_keys[_tab]}/${label ?? s['label']}/${s['heading']}',
        ),
        shape: const Border(),
        collapsedShape: const Border(),
        title: Text(
          label ?? text(s['label']),
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        children: [
          reader.markdown(context, body, path ?? ''),
          if ((note ?? '').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                note!,
                style: const TextStyle(fontSize: 13, color: Color(0xff667085)),
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _sections(dynamic values) =>
      items(values).map((s) => _section(s)).toList();

  Widget _gallery(List<dynamic> images) => StrategyGallery(
    key: ValueKey('$_brandId/$_productId/gallery'),
    images: images,
    reader: reader,
  );

  List<Widget> _brand() {
    final b = object(profile['brand']),
        logo = object(b['logo']),
        type = object(b['typography']),
        guidelines = object(b['guidelines']);
    final character = object(b['character']), audio = object(b['audio']);
    return [
      _panel(
        '로고',
        Column(
          children: [
            Container(
              color: _lightLogo
                  ? const Color(0xfff3f5f9)
                  : const Color(0xff101828),
              padding: const EdgeInsets.all(28),
              child: reader.image(
                context,
                text(logo[_lightLogo ? 'light' : 'dark']),
                height: 150,
              ),
            ),
            if (logo['symbol'] != null)
              reader.image(context, text(logo['symbol']), height: 80),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => reader.share(
                  context,
                  text(logo['download'] ?? logo['dark']),
                ),
                icon: const Icon(Icons.ios_share, size: 16),
                label: const Text('로고 내보내기'),
              ),
            ),
          ],
        ),
        trailing: Row(
          children: [
            IconButton(
              tooltip: '어두운 배경',
              isSelected: !_lightLogo,
              onPressed: () => setState(() => _lightLogo = false),
              icon: const Icon(Icons.dark_mode_outlined),
            ),
            IconButton(
              tooltip: '밝은 배경',
              isSelected: _lightLogo,
              onPressed: () => setState(() => _lightLogo = true),
              icon: const Icon(Icons.light_mode_outlined),
            ),
          ],
        ),
      ),
      _section(guidelines['logo'], label: '로고 가이드라인'),
      _panel(
        '컬러',
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
          child: Wrap(
            spacing: 12,
            runSpacing: 16,
            children: items(b['palette']).map((v) {
              final c = object(v), hex = text(c['hex']);
              final color =
                  int.tryParse(hex.replaceFirst('#', ''), radix: 16) ?? 0;
              return SizedBox(
                width: 96,
                child: InkWell(
                  onTap: () => _copy(hex),
                  borderRadius: BorderRadius.circular(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        height: 76,
                        decoration: BoxDecoration(
                          color: Color(0xff000000 | color),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xffe2e6ed)),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        hex,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        text(c['name']),
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xff667085),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ),
      _section(guidelines['colors'], label: '컬러 가이드라인'),
      _panel(
        '폰트',
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text(type['family']),
                style: const TextStyle(color: Color(0xff667085), fontSize: 12),
              ),
              TextField(
                controller: _sample,
                maxLines: null,
                style: TextStyle(
                  fontFamily: _font,
                  fontSize: 28,
                  fontWeight:
                      FontWeight.values[(_weight ~/ 100 - 1).clamp(0, 8)],
                ),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  hintText: '서체를 미리 확인하세요',
                ),
              ),
              if (_weights(type).isNotEmpty)
                DropdownButton<int>(
                  value: _weight,
                  isExpanded: true,
                  items: _weights(type).map((v) {
                    final w = object(v);
                    return DropdownMenuItem(
                      value: (w['value'] as num).toInt(),
                      child: Text(text(w['label'])),
                    );
                  }).toList(),
                  onChanged: (v) {
                    if (v != null) {
                      setState(() => _weight = v);
                      _loadFont();
                    }
                  },
                ),
            ],
          ),
        ),
      ),
      _section(guidelines['typography'], label: '폰트 가이드라인'),
      _panel(
        '캐릭터',
        reader.image(
          context,
          text(character['asset'] ?? 'studio/demo-character.svg'),
          height: 160,
        ),
      ),
      _section(
        guidelines['character'],
        label: '캐릭터 가이드라인',
        note: text(character['guideline']),
      ),
      _panel(
        '오디오',
        StrategySound(
          key: ValueKey('$_brandId/$_productId'),
          label: text(audio['label']),
        ),
      ),
      _section(
        guidelines['audio'],
        label: '오디오 가이드라인',
        note: text(audio['guideline']),
      ),
      _panel('이미지', _gallery(items(b['images']))),
      _section(guidelines['images'], label: '이미지 가이드라인'),
      ..._sections(b['notes']),
    ];
  }

  List<Widget> _product() {
    final p = object(profile['product']);
    return [
      _panel(
        text(p['name']),
        Column(
          children: [
            reader.image(context, text(p['hero']), height: 240),
            _facts(items(p['facts'])),
          ],
        ),
      ),
      ..._sections(p['sections']),
    ];
  }

  List<Widget> _competitor() {
    final p = object(profile['competitor']);
    final names = items(p['names']);
    return [
      _panel(
        '경쟁 상품 비교',
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            headingRowColor: const WidgetStatePropertyAll(Color(0xfff3f5f9)),
            dataRowMinHeight: 60,
            dataRowMaxHeight: 120,
            columns: [
              const DataColumn(label: Text('항목')),
              ...names.map(
                (n) => DataColumn(
                  label: SizedBox(
                    width: 140,
                    child: Text(
                      text(n),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
            ],
            rows: items(p['rows'])
                .map(
                  (v) => DataRow(
                    cells: List.generate(
                      names.length + 1,
                      (i) => DataCell(
                        SizedBox(
                          width: i == 0 ? 90 : 140,
                          child: SelectableText(
                            i < items(v).length ? text(items(v)[i]) : '—',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: i == 1
                                  ? FontWeight.w700
                                  : FontWeight.w400,
                              color: i == 1 ? const Color(0xff2563eb) : null,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
      ),
      _section(p['criteria']),
      ..._sections(p['sections']),
    ];
  }

  List<Widget> _customer() {
    final p = object(profile['customer']);
    return [
      for (final v in items(p['tiles']))
        _panel(text(object(v)['label']), _facts(items(object(v)['facts']))),
      ..._sections(p['sections']),
    ];
  }

  List<Widget> _brief() {
    final b = object(profile['brief']), messages = items(b['messages']);
    if (messages.isEmpty) return [const Text('등록된 브리프가 없습니다.')];
    final m = object(messages[_message]);
    final labels = items(m['flowLabels']).isEmpty
        ? ['고객의 문제', '상품의 해결 방식', '신뢰할 근거', '다음 행동']
        : items(m['flowLabels']);
    return [
      _panel(
        '고객 설득 메시지',
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                children: List.generate(
                  messages.length,
                  (i) => ChoiceChip(
                    label: Text(text(object(messages[i])['name'])),
                    selected: _message == i,
                    onSelected: (_) => setState(() => _message = i),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              SelectableText(
                text(m['adcopy']),
                style: const TextStyle(
                  fontSize: 25,
                  fontWeight: FontWeight.w700,
                  height: 1.45,
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => _copy(text(m['adcopy'])),
                  icon: const Icon(Icons.copy, size: 16),
                  label: const Text('카피 복사'),
                ),
              ),
            ],
          ),
        ),
      ),
      _panel(
        '메시지 전략',
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _facts([
              for (final pair in [
                ['대상', 'audience'],
                ['구매 이유', 'reason'],
                ['근거', 'proof'],
                ['채널', 'channel'],
                ['목표 행동', 'action'],
              ])
                {'label': pair[0], 'value': m[pair[1]]},
            ]),
            for (final raw in items(m['proofLinks']))
              Builder(
                builder: (context) {
                  final proof = object(raw);
                  final path = source(text(proof['document']));
                  return TextButton.icon(
                    onPressed: proof['url'] != null
                        ? () => reader.link(context, text(proof['url']), '')
                        : path != null
                        ? () => reader.openDocument(
                            context,
                            path,
                            heading: text(proof['fragment']).isEmpty
                                ? ''
                                : RegExp.escape(
                                    text(proof['fragment'])
                                        .replaceAll('-', ' '),
                                  ),
                          )
                        : null,
                    icon: const Icon(Icons.open_in_new, size: 14),
                    label: Text(text(proof['text'])),
                  );
                },
              ),
          ],
        ),
      ),
      _panel(
        '콘텐츠 흐름',
        _facts([
          for (int i = 0; i < items(m['flow']).length; i++)
            {
              'label': i < labels.length ? labels[i] : '흐름 ${i + 1}',
              'value': items(m['flow'])[i],
            },
        ]),
      ),
      _panel(
        '콘텐츠 구성',
        Column(
          children: [
            if (text(m['format']).isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(text(m['format'])),
              ),
            for (final cut in items(m['cuts']))
              ListTile(
                leading: CircleAvatar(
                  backgroundColor: const Color(0xfff3f5f9),
                  child: Text(text(items(cut).first)),
                ),
                title: Text(text(items(cut).elementAtOrNull(1))),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 8, bottom: 12),
                  child: Text(
                    text(items(cut).elementAtOrNull(2)),
                    style: const TextStyle(height: 1.7),
                  ),
                ),
              ),
          ],
        ),
      ),
      ..._sections(b['sections']),
      ..._sections(m['sections']),
    ];
  }

  void _sources() {
    final keys = switch (_tab) {
      0 => ['brand', 'design'],
      3 => ['customer', 'sources'],
      4 => ['brief', 'messages', 'verification'],
      _ => [_keys[_tab], 'verification'],
    };
    final paths = keys
        .map(source)
        .whereType<String>()
        .where(catalog.documents.containsKey)
        .toSet();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const ListTile(
              title: Text(
                '원문 자료',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            for (final p in paths)
              ListTile(
                leading: const Icon(Icons.description_outlined),
                title: Text(text(object(catalog.documents[p])['title'])),
                onTap: () {
                  Navigator.pop(context);
                  reader.openDocument(this.context, p);
                },
              ),
            if (paths.isEmpty) const ListTile(title: Text('등록된 원문이 없습니다.')),
          ],
        ),
      ),
    );
  }

  void _search() {
    Navigator.push(
      context,
      MaterialPageRoute<void>(builder: (_) => StrategySearch(reader: reader)),
    );
  }

  void _chooseProduct() {
    FocusScope.of(context).unfocus();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(sheetContext).height * .75,
          ),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
            children: [
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  '브랜드 · 상품 선택',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
              ),
              for (final raw in catalog.brands) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                  child: Text(
                    text(object(raw)['name']),
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xff667085),
                    ),
                  ),
                ),
                for (final p in items(object(raw)['products']))
                  ListTile(
                    selected:
                        object(raw)['id'] == _brandId &&
                        object(p)['id'] == _productId,
                    selectedTileColor: const Color(0xffeef2f6),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    title: Text(text(object(p)['name'])),
                    trailing:
                        object(raw)['id'] == _brandId &&
                            object(p)['id'] == _productId
                        ? const Icon(Icons.check, size: 20)
                        : null,
                    onTap: () {
                      Navigator.pop(sheetContext);
                      _select(text(object(raw)['id']), text(object(p)['id']));
                    },
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<StrategyCatalog>(
    future: _loading,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Center(
          child: TextButton(
            onPressed: () => setState(() => _loading = StrategyCatalog.load()),
            child: const Text('전략 자료를 불러오지 못했습니다. 다시 시도'),
          ),
        );
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      if (_catalog == null) {
        _catalog = snapshot.data!;
        final defaults = object(
          object(catalog.data['workspace'])['defaultProduct'],
        );
        _brandId = text(defaults['brandId']);
        _productId = text(defaults['productId']);
        _sample.text = text(
          object(object(profile['brand'])['typography'])['sample'],
        );
        _loadFont();
      }
      final views = [_brand, _product, _competitor, _customer, _brief];
      return DefaultTabController(
        length: _tabs.length,
        animationDuration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 180),
        child: ColoredBox(
          color: const Color(0xfff9fafb),
          child: SafeArea(
            top: false,
            child: Column(
              children: [
                if (MediaQuery.viewInsetsOf(context).bottom == 0)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 12, 8),
                    child: Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Strategy',
                            style: TextStyle(
                              fontSize: 23,
                              letterSpacing: -.6,
                              fontWeight: FontWeight.w700,
                              color: Color(0xff101828),
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: '전략 문서 검색',
                          onPressed: _search,
                          icon: const Icon(Icons.search, size: 21),
                        ),
                        IconButton(
                          tooltip: '현재 탭의 원문 보기',
                          onPressed: _sources,
                          icon: const Icon(
                            Icons.description_outlined,
                            size: 21,
                          ),
                        ),
                        if (MediaQuery.sizeOf(context).height <= 500)
                          IconButton(
                            tooltip: '브랜드 · 상품 선택',
                            onPressed: _chooseProduct,
                            icon: const Icon(Icons.unfold_more, size: 21),
                          ),
                      ],
                    ),
                  ),
                if (MediaQuery.viewInsetsOf(context).bottom == 0 &&
                    MediaQuery.sizeOf(context).height > 500)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                    child: Material(
                      color: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: const BorderSide(color: Color(0xffe2e6ed)),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: _chooseProduct,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      text(brand['name']),
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Color(0xff667085),
                                        height: 1.5,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      text(product['name']),
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                        color: Color(0xff101828),
                                        height: 1.4,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 12),
                              const Icon(
                                Icons.unfold_more,
                                size: 20,
                                color: Color(0xff667085),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                TabBar(
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  labelColor: const Color(0xff101828),
                  unselectedLabelColor: const Color(0xff667085),
                  indicatorColor: const Color(0xff101828),
                  indicatorWeight: 2,
                  labelStyle: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                  unselectedLabelStyle: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  tabs: _tabs
                      .map((label) => Tab(text: label, height: 48))
                      .toList(),
                  onTap: (i) {
                    FocusScope.of(context).unfocus();
                    setState(() => _tab = i);
                  },
                ),
                Expanded(
                  child: ListView(
                    key: PageStorageKey('$_brandId/$_productId/$_tab'),
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
                    children: views[_tab](),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class StrategySearch extends StatefulWidget {
  const StrategySearch({super.key, required this.reader});
  final StrategyReader reader;
  @override
  State<StrategySearch> createState() => _StrategySearchState();
}

class _StrategySearchState extends State<StrategySearch> {
  String _query = '';
  @override
  Widget build(BuildContext context) {
    final docs = widget.reader.catalog.documents.entries.where((e) {
      final d = object(e.value);
      return '${d['title']} ${d['body']}'.toLowerCase().contains(
        _query.toLowerCase(),
      );
    }).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('전략 문서 검색')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              autofocus: true,
              onChanged: (v) => setState(() => _query = v.trim()),
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: '브랜드, 상품, 키워드 검색',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          Expanded(
            child: docs.isEmpty
                ? const Center(child: Text('검색 결과가 없습니다.'))
                : ListView.separated(
                    itemCount: docs.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final d = object(docs[i].value), body = text(d['body']);
                      final at = body.toLowerCase().indexOf(
                        _query.toLowerCase(),
                      );
                      final start = at > 30 ? at - 30 : 0;
                      return ListTile(
                        title: Text(text(d['title'])),
                        subtitle: Text(
                          body
                              .substring(
                                start,
                                (start + 120).clamp(0, body.length),
                              )
                              .replaceAll(RegExp(r'[#|`]'), ' '),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () =>
                            widget.reader.openDocument(context, docs[i].key),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
