import { Button, Input } from "@material-tailwind/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Datepicker from "react-tailwindcss-datepicker"
import { getGrievancesUsingRegNos, getCategoryTree, getRealTimeRCA, getCachedRCA, fetchAICategories, fetchAICategoriesHistory, getCriticalCategories, searchGrievancesUsingCDIS, getGrievancesByRegNosUsingCDIS, getAICategories } from "@/services/rca";
import ReactApexChart from "react-apexcharts";
import { ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { defaultFrom, defaultTo, pageSize } from "@/helpers/env";
import GrievanceList from "@/widgets/grievance/list";
import { toast } from "react-toastify";
import Autosuggest from "react-autosuggest";
import stateList from "@/data/state-data"

import './css/autosuggest-theme.css'
import './css/categorical-tree.css'
import { departmentData, getDefaultDepartment, getDepartmentList } from "@/data";
import { Loader } from "@/pages/dashboard/CategoricalTree";
import { endOfMonth, endOfQuarter, lastDayOfYear, setDayOfYear, startOfMonth, startOfQuarter, subMonths, subQuarters, subYears } from "date-fns";
import RectangularPieChart from "@/widgets/charts/RectangularPieChart";
import SearchHistory from "@/widgets/rca/search-history";

export const RealTimeRCA = () => {
    const [rca, setRca] = useState({})
    const [rcaData, setRcaData] = useState({})
    const [appendPath, setAppendPath] = useState(null)
    const [rcaPath, setRcaPath] = useState([])
    const [filters, setFilters] = useState({
        startDate: '2016-08-01',
        endDate: '2016-08-31',
        state: 'All',
        district: 'All',
        ministry: 'DOCAF',
        showAll: true,
        number_of_clusters: 11
    })
    const [searching, setSearching] = useState(false)
    const [generatingAICategories, setGeneratingAICategories] = useState(false)
    const [aiCategoriesData, setAiCategoriesData] = useState(null)
    const [loadingAIReport, setLoadingAIReport] = useState(false)
    const [history, setHistory] = useState([])
    const [hide_filters, setHide_filters] = useState(false)

    const currentBranch = (customPath = null) => {
        let path = customPath ?? rcaPath

        return path.reduce(
            (branch, childIndex) => {
                return branch.children[childIndex]
            },
            rca
        )
    }

    const updatePathLength = length => setRcaPath([...rcaPath.splice(0, length)])

    const series = useMemo(() => {
        let branch = currentBranch()

        let series = branch?.children?.map(child => ({
            title: child.title || '',
            value: typeof child.count === 'number' ? child.count : (typeof child.count === 'string' ? parseInt(child.count) || 0 : 0),
            description: child.description || child.title || ''
        }))

        const result = series?.length > 0 ? series : [{
            title: branch?.title || '',
            value: typeof branch?.count === 'number' ? branch.count : (typeof branch?.count === 'string' ? parseInt(branch.count) || 0 : 0),
            description: branch?.description || branch?.title || ''
        }];

        console.log('Series data generated:', result); // Debug log
        return result;
    }, [rcaPath, rca])

    const breadcrumbs = useMemo(() => getBreadCrumbs(rca, rcaPath), [rca, rcaPath])

    const generateAICategories = async () => {
        setGeneratingAICategories(true)

        try {
            const response = await fetchAICategories(filters)
            setHistory([...history, response.data])
            setRcaData(response.data)
        } catch (error) {
            toast.error('Failed to generate AI categories!', { position: 'top-center' })
        } finally {
            setGeneratingAICategories(false)
        }
    }

    // New function to generate AI Report using CDIS API
    const generateAIReport = async () => {
        setLoadingAIReport(true);
        
        try {
            console.log('🤖 Generating AI Report...');
            const response = await getAICategories();
            
            if (response?.data?.categories && response.data.categories.length > 0) {
                setAiCategoriesData(response.data);
                console.log('🤖 AI Report generated successfully:', {
                    categoriesCount: response.data.categories.length,
                    sampleCategory: response.data.categories[0]
                });
                toast.success('AI Report generated successfully!', { position: 'top-center' });
            } else {
                toast.warning('No AI categories data available', { position: 'top-center' });
            }
        } catch (error) {
            console.error('❌ AI Report generation failed:', error);
            toast.error('Failed to generate AI Report!', { position: 'top-center' });
        } finally {
            setLoadingAIReport(false);
        }
    }

    const getHistory = async () => {
        try {
            const response = await fetchAICategoriesHistory()

            // console.log({ cata: response.data.categories })

            setHistory(response.data?.categories || [])
        } catch (error) {
            console.warn('Failed to fetch AI categories history:', error)
            setHistory([]) // Fallback to empty array on error
        }
    }

    const useHistory = async (old_result) => {
        // console.log({ old_result })
        setFilters({
            ...filters,
            startDate: old_result.start_date,
            endDate: old_result.end_date,
            ministry: old_result.ministry
        })

        const ai_rca_data = JSON.parse(old_result.rcadata)

        setRcaPath([])
        setRca(buildAiTree(ai_rca_data))
        setRcaData(ai_rca_data)

        setHide_filters(true)
        setTimeout(() => setHide_filters(false), 100)
    }

    const loadCachedRCA = async () => {
        setSearching(true)
        
        try {
            const requestParams = {
                startDate: filters.startDate,
                endDate: filters.endDate,
                ministry: filters.ministry,
                number_of_clusters: filters.number_of_clusters
            };
            console.log('API Request Parameters:', requestParams); // Debug log
            
            const response = await getCachedRCA(requestParams)

            console.log('Full API Response:', response); // Debug log
            console.log('API Response Data:', response?.data); // Debug log

            if (response?.data && Object.keys(response?.data).length > 0) {
                console.log('Building tree with data:', response.data); // Debug log
                const tree = buildTree(response.data)
                console.log('Built tree:', tree); // Debug log
                
                if (tree) {
                    setRcaPath([])
                    setRca(tree)
                    setRcaData(response.data)
                    toast("Cached RCA loaded successfully!", { type: 'success' })
                } else {
                    console.warn('buildTree returned null');
                    toast("Invalid cached data structure! Loading regular RCA...", { type: 'warning' })
                    await loadRegularRCA()
                }
            } else {
                console.warn('No data in response');
                toast("No cached data found! Loading regular RCA...", { type: 'warning' })
                // Fallback to regular RCA
                await loadRegularRCA()
            }
        } catch (error) {
            console.error("Cached RCA error:", error)
            toast("Failed to load cached RCA, trying regular RCA...", { type: 'warning' })
            // Fallback to regular RCA
            await loadRegularRCA()
        }
        
        setSearching(false)
    }

    const loadRegularRCA = async () => {
        try {
            const response = await getRealTimeRCA(filters)
            
            if (response?.data && Object.keys(response?.data).length > 0) {
                const tree = buildTree(response.data)
                if (tree) {
                    setRcaPath([])
                    setRca(tree)
                    setRcaData(response.data)
                } else {
                    toast("Invalid response data structure!", { type: 'error' })
                }
            } else {
                toast("No data found!", { type: 'error' })
            }
        } catch (error) {
            console.error("Regular RCA error:", error)
            toast("Work in progress for this ministry, please be patient!", { type: 'error' })
        }
    }

    useEffect(() => {
        if (searching) {
            loadCachedRCA()
        }
    }, [searching])

    useEffect(() => {
        if (appendPath != null) {
            let new_path = [...rcaPath, appendPath]

            if (currentBranch(new_path))
                setRcaPath(new_path)
            else
                toast.warn('Reached leaf node, cannot go further!')

            setAppendPath(null)
        }
    }, [appendPath])

    useEffect(() => {
        getHistory()

        // const ab = async () => {
        //     console.log(await getCriticalCategories())
        // }

        // ab()
    }, [])

    return (
        <div>
            {
                !hide_filters &&
                <Filters
                    filters={filters}
                    setFilters={setFilters}
                    searching={searching}
                    startSearch={() => setSearching(true)}
                    showAiButtons={Object.keys(rcaData).length > 0}
                    generatingAICategories={generatingAICategories}
                    generateAICategories={generateAICategories}
                    generateAIReport={generateAIReport}
                    loadingAIReport={loadingAIReport}
                    loadRegularRCA={() => {
                        setSearching(true)
                        loadRegularRCA().finally(() => setSearching(false))
                    }}
                />
            }

            {/* <Chart
                series={series}
                pushPath={setAppendPath}
            /> */}

            {
                !(currentBranch()?.reg_nos && currentBranch().reg_nos.length > 0) &&
                <SearchHistory history={(history || []).slice(0, 20)} search={useHistory} />
            }

            {
                aiCategoriesData && <AICategoriesDisplay data={aiCategoriesData} />
            }

            <Chart2
                data={series}
                pushPath={setAppendPath}
            />

            <BreadCrumbs
                list={breadcrumbs}
                setPathLength={updatePathLength}
            />

            {
                currentBranch()?.reg_nos && Array.isArray(currentBranch().reg_nos) && currentBranch().reg_nos.length > 0 && (
                    <>
                        <GrievanceListBox 
                            reg_nos={currentBranch().reg_nos} 
                            categoryTitle={currentBranch().title || ""} 
                        />
                    </>
                )
            }
        </div>
    )
}

export const DEFAULT_STATE_DISTRICT = {
    text: '',
    values: {
        state: 'All',
        district: 'All'
    }
}

export const DEFAULT_MINISTRY = {
    text: '',
    value: getDefaultDepartment()
}

export const Filters = ({
    filters,
    setFilters,
    searching,
    startSearch = () => '',
    generatingAICategories,
    showAiButtons,
    generateAICategories = () => '',
    generateAIReport = () => '',
    loadingAIReport = false,
    CustomActionButton = null,
    loadRegularRCA = () => ''
}) => {
    const [dateRange, setDateRange] = useState({
        startDate: '2016-08-01',
        endDate: '2016-08-31'
    });
    const [stateDistrict, setStateDistrict] = useState(DEFAULT_STATE_DISTRICT)
    const [ministry, setMinistry] = useState({
        text: 'DOCAF',
        value: 'DOCAF'
    })
    const [numberOfClusters, setNumberOfClusters] = useState(filters.number_of_clusters || 11)

    useEffect(() => {
        setFilters({
            ...filters,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            ...(
                stateDistrict?.values ?? DEFAULT_STATE_DISTRICT.values
            ),
            ministry: ministry?.value ?? DEFAULT_MINISTRY.value,
            number_of_clusters: numberOfClusters
        })
    }, [dateRange, stateDistrict, ministry, numberOfClusters])

    return (
        <div className="grid md:grid-cols-4 xl:grid-cols-8 gap-3">
            <div className="col-span-2">
                <DateRangePicker
                    value={dateRange}
                    onChange={setDateRange}
                />
            </div>

            <div className="col-span-2">
                <Input
                    label="Ministry"
                    value="DOCAF"
                    disabled
                    className="h-[2.6rem]"
                />
            </div>

            <div className="col-span-1">
                <Input
                    label="Clusters"
                    type="number"
                    min="1"
                    max="50"
                    value={numberOfClusters}
                    onChange={(e) => setNumberOfClusters(Number(e.target.value))}
                    className="h-[2.6rem]"
                />
            </div>

            {/* <div className="col-span-2">
                <StateDistrictAutocomplete stateDistrict={stateDistrict} setStateDistrict={setStateDistrict} />
            </div> */}

            <div className="col-span-2 xl:col-span-3 flex flex-col md:flex-row md:justify-end gap-2">
                {
                    CustomActionButton
                    ?? 
                    <div className="flex gap-2">
                        <Button
                            className="h-[2.6rem] flex justify-center items-center"
                            onClick={startSearch}
                            disabled={searching || loadingAIReport}
                            color="blue"
                        >
                            {
                                searching &&
                                <Loader className="mr-2 animate-spin" color="#fff" />
                            }
                            
                            {searching ? "Loading..." : "Search"}
                        </Button>
                        
                        <Button
                            className="h-[2.6rem] flex justify-center items-center bg-purple-600 hover:bg-purple-700"
                            onClick={generateAIReport}
                            disabled={searching || loadingAIReport}
                            color="purple"
                        >
                            {
                                loadingAIReport &&
                                <Loader className="mr-2 animate-spin" color="#fff" />
                            }
                            
                            {loadingAIReport ? "Generating..." : "Generate AI Report"}
                        </Button>
                    </div>
                }
            </div>

            {/* <AutocompleteField
                label="Test label"
                {...frontendProps}
                name={nameWithMultipleValues}
                allowMultiple={true}
            /> */}
        </div>
    )
}

export const Chart = ({
    series,
    pushPath
}) => {

    const childClick = (e, p, opts) => {
        if (opts.dataPointIndex != -1)
            pushPath(opts.dataPointIndex)
    }

    const options = {
        legend: {
            show: false
        },
        chart: {
            height: 250,
            type: 'treemap',
            toolbar: {
                show: false
            },
            events: {
                click: childClick
            }
        },
        dataLabels: {
            background: {
                padding: 0
            }
        },
        tooltip: {
            fixed: {
                enabled: true,
                position: 'topRight',
                offsetX: 0,
                offsetY: 0,
            }
        }
    }

    return (
        <>
            {
                series[0]?.data?.length > 0 && series[0].data[0].x &&
                <div id="chart" className="border-2 border-black pb-1 rounded-lg border-sky treemap-fitting relative mt-4">
                    <ReactApexChart
                        options={options}
                        series={series}
                        type={options.chart.type}
                        height={(series[0]?.data?.length > 0) ? options.chart.height : 10}
                        className="test"
                    />
                </div>
            }
        </>
    )
}

const Chart2 = ({
    data,
    pushPath
}) => {
    const [delayedData, setDelayedData] = useState(null)

    useEffect(() => {
        setDelayedData(null)
        setTimeout(() => {
            // Validate and clean the data before setting
            if (data && Array.isArray(data)) {
                const cleanedData = data.map(item => ({
                    title: item.title || '',
                    value: typeof item.value === 'number' && !isNaN(item.value) ? item.value : 0,
                    description: item.description || item.title || ''
                }));
                console.log('Cleaned data for chart:', cleanedData); // Debug log
                setDelayedData(cleanedData);
            }
        }, 10)
    }, [data])

    return (
        delayedData && delayedData.length > 0 &&
        <RectangularPieChart data={delayedData} onClick={pushPath} width={1000} />
    )
}

export const BreadCrumbs = ({
    list,
    setPathLength
}) => {
    return (
        <div className="flex mt-3 justify-between align-center gap-4 mx-4">
            <div className="pathbox">
                <div className="flex flex-wrap">
                    {
                        list.slice(0, list.length - 1).map((step, key) =>
                            <div className="flex cursor-pointer" key={key} onClick={() => setPathLength(key)}>
                                <div className="text-blue-900 text-sm">{step}</div> <ChevronRightIcon color="#2254fa" width={18} />
                            </div>
                        )
                    }
                </div>
                <div className="text-lg font-bold text-blue-900 whitespace-break-spaces">
                    {list[list.length - 1]?.replace(/,/g, ', ')}
                </div>
            </div>
        </div>
    )
}

export const GrievanceListBox = ({
    reg_nos = [], // Default to empty array
    categoryTitle = "" // Add category title for CDIS search
}) => {
    const [grievances, setGrievances] = useState([])
    const [pageno, setPageno] = useState(1)
    const [first, setFirst] = useState(true)
    const [searching, setSearching] = useState(false)

    // Function to search grievances using CDIS API based on category title
    const searchGrievancesByCategory = useCallback(async (categoryName) => {
        if (!categoryName || categoryName.trim() === "") {
            console.warn('No category name provided for CDIS search');
            return [];
        }

        try {
            console.log('Searching grievances for category:', categoryName);
            const response = await searchGrievancesUsingCDIS(categoryName, {
                value: 2, // Keyword search
                size: 20,
                skiprecord: (pageno - 1) * 20
            });

            if (response?.data && Array.isArray(response.data)) {
                console.log('✅ CDIS search results found:', response.data.length, 'grievances');
                console.log('Sample CDIS data:', response.data[0]); // Show first item structure
                
                // Use the already transformed data from the CDIS service
                // The data is already properly mapped in the rca.js service
                return response.data;
            }
            
            return [];
        } catch (error) {
            console.error('CDIS search error:', error);
            return [];
        }
    }, [pageno]);

    const getGrievances = useCallback(async () => {
        // Safety check for reg_nos
        if (!reg_nos || !Array.isArray(reg_nos) || reg_nos.length === 0) {
            console.warn('No valid reg_nos provided to GrievanceListBox');
            setGrievances([]);
            setSearching(false);
            return;
        }

        let from = (pageno - 1) * pageSize
        let to = from + pageSize

        const selectedRegNos = reg_nos.slice(from, to);
        console.log('Fetching grievances for reg_nos:', selectedRegNos); // Debug log
        console.log('Total reg_nos available:', reg_nos.length); // Debug log

        setSearching(true)

        try {
            const response = await getGrievancesUsingRegNos(selectedRegNos);
            console.log('=== GRIEVANCES API RESPONSE ANALYSIS ===');
            console.log('Full response object:', response);
            console.log('Response.data:', response?.data);
            console.log('Response.data keys:', response?.data ? Object.keys(response.data) : 'No data');
            console.log('Response.data.data:', response?.data?.data);
            
            // Check if the response has data in different structure
            if (response?.data?.data && Object.keys(response.data.data).length > 0) {
                const grievanceData = Object.values(response.data.data);
                console.log('✅ Found grievances in data.data:', grievanceData);
                setGrievances(grievanceData);
            } else if (response?.data && !response?.data?.success && Object.keys(response.data).length > 0) {
                // Sometimes data comes directly in response.data without .data wrapper
                const grievanceData = Object.values(response.data);
                console.log('✅ Found grievances directly in data:', grievanceData);
                setGrievances(grievanceData);
            } else if (response?.data && response?.data?.success) {
                // API returned success but no data - try different approaches
                console.warn('❌ Original API returned success but no grievance data found');
                console.log('🔄 Trying CDIS direct registration search...');
                
                try {
                    // Try CDIS direct registration number search
                    const cdisRegResponse = await getGrievancesByRegNosUsingCDIS(selectedRegNos);
                    if (cdisRegResponse?.data && Array.isArray(cdisRegResponse.data) && cdisRegResponse.data.length > 0) {
                        console.log('✅ CDIS registration search found grievances:', cdisRegResponse.data.length);
                        console.log('Sample registration data:', cdisRegResponse.data[0]); // Show first item structure
                        
                        // Use the already transformed data from the CDIS service
                        setGrievances(cdisRegResponse.data);
                        return;
                    }
                } catch (cdisRegError) {
                    console.error('CDIS registration search failed:', cdisRegError);
                }
                
                // If registration search failed, try category-based search
                if (categoryTitle && categoryTitle.trim()) {
                    console.log('🔄 Trying CDIS category search...');
                    try {
                        const cdisResults = await searchGrievancesByCategory(categoryTitle);
                        if (cdisResults.length > 0) {
                            console.log('✅ CDIS category search found grievances:', cdisResults);
                            setGrievances(cdisResults);
                            return;
                        }
                    } catch (cdisError) {
                        console.error('CDIS category search failed:', cdisError);
                    }
                }
                
                // Final fallback - create sample data but with a warning
                console.warn('⚠️ All search methods failed, showing sample data');
                const sampleGrievances = selectedRegNos.slice(0, 3).map((regNo, index) => ({
                    registration_no: regNo,
                    grievance_text: `[SAMPLE] Sample grievance ${index + 1} for registration ${regNo} - Real data not found in CDIS API`,
                    state: 'Sample State',
                    district: 'Sample District', 
                    received_date: '2016-08-15',
                    closing_date: '2016-08-30',
                    status: 'Sample - Data Not Found',
                    ministry: 'DOCAF'
                }));
                setGrievances(sampleGrievances);
            } else if (response?.data) {
                // Try alternative response structure
                const dataKeys = Object.keys(response.data);
                console.log('Response data keys:', dataKeys); // Debug log
                
                if (dataKeys.length > 0 && !response.data.success) {
                    // Try to extract data differently (if keys are not just "success")
                    const grievanceData = Object.values(response.data);
                    console.log('Alternative grievances:', grievanceData); // Debug log
                    setGrievances(grievanceData);
                } else {
                    console.warn('No valid data found in response structure:', response);
                    setGrievances([]);
                }
            } else {
                console.warn('Invalid grievances response structure:', response);
                setGrievances([]);
            }
        } catch (error) {
            console.error('Error fetching grievances:', error);
            setGrievances([]);
        } finally {
            setSearching(false);
        }
    }, [reg_nos, pageno, categoryTitle, searchGrievancesByCategory])

    useEffect(() => {
        if (pageno != 1)
            setPageno(1)
        else
            getGrievances()
    }, [reg_nos])

    useEffect(() => {
        if (first)
            setFirst(false)
        else
            getGrievances()
    }, [pageno])

    // Debug grievances data before rendering
    console.log('📋 GrievanceListBox rendering with grievances:', grievances.length, 'items');
    if (grievances.length > 0) {
        console.log('📋 First grievance item:', grievances[0]);
    }

    return (
        <GrievanceList
            titleBarHidden={true}
            grievances={grievances}
            pageno={pageno}
            setPageno={setPageno}
            count={reg_nos.length > pageSize ? pageSize : reg_nos.length}
            total={reg_nos.length}
            scrollH={'80vh'}
            searching={searching}
        />
    )
}

export const StateDistrictAutocomplete = ({
    stateDistrict,
    setStateDistrict
}) => {
    return (
        <Autocomplete
            options={getStateDistrictOptions()}
            value={stateDistrict}
            onChange={setStateDistrict}
            placeholder="Enter State or District"
            title={"State > District"}
        />
    )
}

export const MultipleMinistryAutocomplete = ({
    ministry,
    setMinistry,
    className = ''
}) => {
    const [multipleMinistry, setMultipleMinistry] = useState([])
    // const multipleTitle = useMemo(() => `Ministry${multipleMinistry.length > 0 ? `: ${multipleMinistry.map(({ value }) => value).join(',')}` : ''}`, [multipleMinistry])
    const [value, setValue] = useState(ministry)

    const addMultipleMinistry = (ministry) => {
        if (ministry && ministry.value) {
            if (multipleMinistry.findIndex(({ value }) => value == ministry.value) == -1) {
                if (ministry.value != 'All')
                    setMultipleMinistry([...multipleMinistry, ministry])

                setValue({
                    text: '',
                    value: 'All'
                })
            }
        }
    }

    const removeMinistry = (index) => {
        setMultipleMinistry([...multipleMinistry.slice(0, index), ...multipleMinistry.slice(index + 1)])
    }

    useEffect(() => {
        const ministries = multipleMinistry
            .filter((ministry) => (ministry?.text?.length > 0 && ministry?.value && ministry?.value?.length > 0))
            .map(({ value }) => value).join(',')

        setMinistry({
            text: '',
            value: ministries.length > 0 ? ministries : 'All'
        })
    }, [multipleMinistry])

    // useEffect(() => {
    //     if (ministry.value && ministry.value.length > 0) {
    //         setMultipleMinistry(
    //             ministry.value.split(',').map((minis) => ({
    //                 text: '',
    //                 value: minis
    //             }))
    //         )
    //     }
    // }, [ministry])

    return (
        <div className="relative">
            <div className="absolute -top-6 left-0 flex gap-2 z-10 overflow-scroll w-[100%] scrollbar-none scrollbar-thumb-rounded scrollbar-thumb-gray-500 scrollbar-track-gray-300">
                {
                    multipleMinistry
                        // .filter(({ value, text }) => text.length > 0 && value.length > 0)
                        .map(({ value }, index) =>
                            <div className="bg-red-50 rounded-full text-sm border border-red-300 px-1 group flex gap-1 items-center select-none cursor-default" key={index}>
                                {value}

                                <XMarkIcon height={'1rem'} width={'1rem'} className="hidden group-hover:block cursor-pointer" onClick={() => removeMinistry(index)} />
                            </div>
                        )
                }
            </div>

            <Autocomplete
                options={getMinistryOptions()}
                value={value}
                onChange={addMultipleMinistry}
                placeholder="Enter Ministry"
                title={'Ministry'}
                className={className}
            />
        </div>
    )
}

export const MinistryAutocomplete = ({
    ministry,
    setMinistry,
    className = ''
}) => {
    return (
        <Autocomplete
            options={getMinistryOptions()}
            value={ministry}
            onChange={setMinistry}
            placeholder="Enter Ministry"
            title="Ministry"
            className={className}
        />
    )
}

export const Autocomplete = ({
    options,
    value,
    onChange,
    placeholder,
    title,
    className = '',
    xMarkClassName = ''
}) => {
    const [suggestions, setSuggestions] = useState([])
    const [inputValue, setInputValue] = useState(value)

    const updateSuggestions = async (search) => {
        if (typeof search == 'string') {
            // search = (typeof search == 'string') ? search : search.text
            search = search.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

            let new_suggestions = []
            if (options instanceof Function) {
                new_suggestions = await options(search)
            }
            else {
                new_suggestions = options.filter(option => textIncludes(option.text, search))

                const alternate_suggestions = getAlternateSuggestions(options, search)

                new_suggestions = appendNonRepeatingSuggestions(new_suggestions, alternate_suggestions)
            }

            setSuggestions([...new_suggestions])
        }

        // Starts With, Includes Search and exact search for the entire search and then the words in the search
    }

    const clearInput = () => {
        setInputValue('')
        onChange(undefined)
    }

    const shouldRenderSuggestions = value => typeof value != 'object'

    useEffect(() => {
        setInputValue(value ?? '')
    }, [value])

    return (
        <div className={`relative w-full font-autosuggest z-[20] ${className}`}>
            <Autosuggest
                suggestions={suggestions}
                onSuggestionsFetchRequested={async ({ value }) => await updateSuggestions(value)}
                onSuggestionsClearRequested={() => setSuggestions([])}
                getSuggestionValue={suggestion => suggestion}
                renderSuggestion={suggestion => <div>{capitalize(suggestion.text)}</div>}
                shouldRenderSuggestions={shouldRenderSuggestions}
                inputProps={{
                    value: capitalize(((typeof inputValue == 'string') ? inputValue : inputValue?.text) ?? ''),
                    onChange: async (e, { newValue }) => {
                        if (typeof newValue == 'object')
                            onChange(newValue)
                        else if (typeof newValue == 'string')
                            onChange({
                                text: newValue
                            })
                        else
                            onChange(undefined)

                        setInputValue(newValue)
                    },
                    placeholder: placeholder,
                    spellCheck: false,
                    onBlur: () => {
                        if (typeof stateDistrict == 'string')
                            onChange(DEFAULT_STATE_DISTRICT)
                    }
                }}
            />

            {
                title &&
                <label className="absolute text-sm text-gray-500 duration-300 transform -translate-y-4 translate-x-2 border-t-2 border-[#aaa] rounded-full scale-75 top-2 z-1 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto start-1 select-none">
                    {title}
                </label>
            }

            {
                value != '' &&
                <label
                    className="absolute text-sm text-gray-500 duration-300 transform rounded-full top-2 right-1 scale-90 z-1 origin-[0] bg-white px-2 start-1 select-none cursor-pointer"
                    onClick={clearInput}
                >
                    <XMarkIcon height={'1.53rem'} className={xMarkClassName} fill="#ccc" />
                </label>
            }

        </div>
    )
}

export const DateRangePicker = ({
    value,
    onChange,
    shortPopup = false
}) => {
    return (
        <div className="relative w-full">
            <Datepicker
                value={value}
                onChange={onChange}
                placeholder="Select Date Range*"
                inputId="DateRange"
                displayFormat="D MMM, YY"
                showShortcuts={true}
                configs={{
                    shortcuts: dateRangeShortcuts
                }}
                containerClassName={`relative w-full text-gray-700 input-date child-font-bold ${shortPopup && 'short-popup'}`}
                readOnly={true}
                maxDate={new Date()}
                useRange={false}
                popoverDirection="down"
            />

            <label className="absolute text-sm text-gray-500 duration-300 transform -translate-y-4 translate-x-2 border-t-2 border-[#aaa] rounded-full scale-75 top-2 z-10 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto start-1 select-none">
                Date Range
            </label>
        </div>
    )
}

function buildTree(flatData) {
    // Validate that flatData has the required structure
    if (!flatData || typeof flatData !== 'object') {
        console.warn('buildTree: Invalid flatData structure:', flatData)
        return null
    }

    if (!flatData.words || !flatData.count) {
        console.warn('buildTree: Missing required properties (words, count):', flatData)
        return null
    }

    if (!flatData.words["0"]) {
        console.warn('buildTree: Missing root node data (words["0"]):', flatData)
        return null
    }

    const root = {
        title: flatData.words["0"],
        count: flatData.count["0"],
        reg_nos: flatData.doc_ids ? flatData.doc_ids["0"] : [], // Handle missing doc_ids
        children: []
    };

    const nodeMap = {
        "0": root
    };

    const sortedKeys = Object.keys(flatData.words).sort((a, b) => a.split('.').length - b.split('.').length);

    for (const key of sortedKeys) {
        if (key === "0") continue;

        const node = {
            title: flatData.words[key],
            count: flatData.count[key],
            reg_nos: flatData.doc_ids ? flatData.doc_ids[key] : [], // Handle missing doc_ids
            children: []
        };

        nodeMap[key] = node;

        const parentKey = key.split('.').slice(0, -1).join('.');
        const parentNode = nodeMap[parentKey];

        if (parentNode) {
            parentNode.children.push(node);
        }
    }

    return root;
}



function buildAiTree(flatData) {
    const root = {
        title: flatData.labels["0"]['Title'],
        description: flatData.labels["0"]['Description'],
        count: flatData.count["0"],
        reg_nos: flatData.doc_ids["0"],
        children: []
    };

    const nodeMap = {
        "0": root
    };

    const sortedKeys = Object.keys(flatData.labels).sort((a, b) => a.split('.').length - b.split('.').length);

    for (const key of sortedKeys) {
        if (key === "0") continue;

        const node = {
            title: flatData.labels[key]['Title'],
            description: flatData.labels[key]['Description'],
            count: flatData.count[key],
            reg_nos: flatData.doc_ids[key],
            children: []
        };

        nodeMap[key] = node;

        const parentKey = key.split('.').slice(0, -1).join('.');
        const parentNode = nodeMap[parentKey];

        if (parentNode) {
            parentNode.children.push(node);
        }
    }

    return root;
}



export const generateTreeFromRca = (rca_object, title) => {
    let reg_nos = rca_object?.registration_no ?? []
    let branch = {
        reg_nos: reg_nos,
        count: reg_nos.length,
        title: title.trim(),
        children: []
    }

    for (let branch_title in rca_object) {
        if (!['count', 'registration_no'].includes(branch_title)) {
            let child_tree = generateTreeFromRca(rca_object[branch_title], branch_title)

            branch.reg_nos = [...branch.reg_nos, ...child_tree.reg_nos]
            branch.count += child_tree.reg_nos.length
            branch.children.push(child_tree)
        }
    }

    return branch
}

export const getBreadCrumbs = (tree, path = []) => [
    tree.title,
    ...(
        path.length > 0
            ? getBreadCrumbs(tree.children[path[0]], path.slice(1))
            : []
    )
]

export const capitalize = sentence => {
    return sentence?.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase() ?? letter)
}


const getStateDistrictOptions = () => {
    let states = Object.keys(stateList)

    let state_options = states.map(state => ({
        text: state,
        values: {
            state: state,
            district: 'All'
        }
    }))

    let district_options = states.reduce((options, state) => {
        return [
            ...options,
            ...stateList[state].map(district => ({
                text: `${state} > ${district}`,
                values: {
                    state: state,
                    district: district
                }
            }))
        ]
    }, [])

    return [
        ...state_options,
        ...district_options
    ]
}

const getMinistryOptions = () => getDepartmentList().map(department => ({
    text: department.label,
    value: department.value
}))

export const textIncludes = (text, search) => text.toLowerCase().trim().includes(search)

// Count the occurnace of a search/word in a string
export const countOccurance = (text, search) => text.match(new RegExp(search, 'g'))?.length ?? 0

const getAlternateSuggestions = (options, search) => {
    let alternates = options.reduce((alternates, option) => {
        search.split(' ').forEach(word => {
            let occurances = countOccurance(option.text, word)

            if (occurances > 0) {
                if (alternates[option.text] == undefined)
                    alternates[option.text] = 0
                alternates[option.text] += occurances
            }
        })

        return alternates
    }, {})

    // Sorting from heighest to lowest occurances
    let alternate_texts = Object.keys(alternates)
        .sort((a, b) => alternates[b] - alternates[a])

    return alternate_texts.map(alternate_text =>
        options.find(option => option.text == alternate_text)
    )
}

const appendNonRepeatingSuggestions = (primary_suggestions, secondary_suggestions) => [
    ...primary_suggestions,
    ...secondary_suggestions
        .filter(secondary =>
            primary_suggestions
                .find(primary =>
                    primary.text == secondary.text
                )
            == undefined
        )
]

const dateRangeShortcuts = {
    today: "Today",
    yesterday: "Yesterday",
    past: period => `Last ${period} Days`,
    currentMonth: "This Month",
    pastMonth: "Last Month",
    last2Months: {
        text: "Last 2 Months",
        period: {
            start: startOfMonth(subMonths(new Date(), 2)),
            end: endOfMonth(subMonths(new Date(), 1))
        }
    },
    last3Months: {
        text: "Last 3 Months",
        period: {
            start: startOfMonth(subMonths(new Date(), 3)),
            end: endOfMonth(subMonths(new Date(), 1))
        }
    },
    last4Months: {
        text: "Last 4 Months",
        period: {
            start: startOfMonth(subMonths(new Date(), 4)),
            end: endOfMonth(subMonths(new Date(), 1))
        }
    },
    last6Months: {
        text: "Last 6 Months",
        period: {
            start: startOfMonth(subMonths(new Date(), 6)),
            end: endOfMonth(subMonths(new Date(), 1))
        }
    },
    thisQuarter: {
        text: "This Quarter",
        period: {
            start: startOfQuarter(new Date()),
            end: endOfQuarter(new Date())
        }
    },
    lastQuarter: {
        text: "Last Quarter",
        period: {
            start: startOfQuarter(subQuarters(new Date(), 1)),
            end: endOfQuarter(subQuarters(new Date(), 1))
        }
    },
    thisYear: {
        text: "This Year",
        period: {
            start: setDayOfYear(new Date(), 1),
            end: lastDayOfYear(new Date())
        }
    },
    lastYear: {
        text: "Last Year",
        period: {
            start: setDayOfYear(subYears(new Date(), 1), 1),
            end: lastDayOfYear(subYears(new Date(), 1))
        }
    }
}

// AI Categories Display Component
export const AICategoriesDisplay = ({ data }) => {
    const [expandedCategories, setExpandedCategories] = useState(new Set());
    
    if (!data || !data.categories || data.categories.length === 0) {
        return (
            <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">AI Generated Categories Report</h2>
                <p className="text-gray-600">No AI categories data available.</p>
            </div>
        );
    }

    const toggleCategory = (categoryId) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };

    const renderCategoryHierarchy = (rcaData) => {
        const { words, count, labels } = rcaData;
        const hierarchyKeys = Object.keys(words).sort((a, b) => {
            // Sort by hierarchy depth (number of dots) and then alphabetically
            const depthA = a.split('.').length;
            const depthB = b.split('.').length;
            if (depthA !== depthB) return depthA - depthB;
            return a.localeCompare(b);
        });

        return hierarchyKeys.map(key => {
            const depth = key.split('.').length - 1;
            const categoryWords = words[key];
            const categoryCount = count[key];
            const label = labels[key];
            const isExpanded = expandedCategories.has(key);
            
            return (
                <div key={key} className={`ml-${depth * 4} mb-3 border-l-2 border-gray-200 pl-4`}>
                    <div 
                        className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded"
                        onClick={() => toggleCategory(key)}
                    >
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <ChevronRightIcon 
                                    className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                />
                                <span className="font-semibold text-blue-600">ID: {key}</span>
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                                    Count: {categoryCount}
                                </span>
                            </div>
                            
                            {label && (
                                <div className="mt-2 ml-6">
                                    <div className="font-medium text-gray-800">{label.Title}</div>
                                    <div className="text-sm text-gray-600">{label.Description}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {isExpanded && (
                        <div className="mt-2 ml-6 p-3 bg-gray-50 rounded">
                            <div className="text-sm">
                                <strong>Keywords:</strong> {categoryWords}
                            </div>
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">AI Generated Categories Report</h2>
                <div className="text-sm text-gray-600">
                    Total Categories: {data.categories.length}
                </div>
            </div>
            
            {data.categories.map((category, index) => (
                <div key={index} className="mb-8 border border-gray-200 rounded-lg p-4">
                    <div className="mb-4 pb-2 border-b border-gray-200">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div><strong>Index:</strong> {category.idx}</div>
                            <div><strong>Start Date:</strong> {category.start_date}</div>
                            <div><strong>End Date:</strong> {category.end_date}</div>
                            <div><strong>Ministry:</strong> {category.ministry}</div>
                        </div>
                    </div>
                    
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-purple-600 mb-2">Hierarchical Categories</h3>
                        <div className="max-h-96 overflow-y-auto border border-gray-100 rounded p-2">
                            {renderCategoryHierarchy(JSON.parse(category.rcadata))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
